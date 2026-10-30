"""Shared browser authentication and Chess.com protobuf decoding."""
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from google.protobuf import descriptor_pb2, descriptor_pool, json_format, message_factory

ROOT = Path(__file__).resolve().parent


def message(name):
    global _pool
    if '_pool' not in globals():
        _pool = descriptor_pool.Default()
        pending = list(descriptor_pb2.FileDescriptorSet.FromString((ROOT / 'schema.pb').read_bytes()).file)
        while pending:
            remaining = []
            for descriptor in pending:
                try:
                    _pool.Add(descriptor)
                except Exception:
                    remaining.append(descriptor)
            if len(remaining) == len(pending):
                raise RuntimeError('Cannot load bundled protobuf dependencies')
            pending = remaining
    return message_factory.GetMessageClass(_pool.FindMessageTypeByName(name))()


def decode(frame):
    response = message('chesscom.ceac.v2.GameReviewResponse')
    response.ParseFromString(frame)
    return response, json_format.MessageToDict(response, preserving_proto_field_name=True)


DEFAULT_PROFILE = Path.home() / '.local/share/chelysis/chesscom-chrome'


def browser_args(parser):
    parser.add_argument('--login', action='store_true', help='Open Chrome for manual Chess.com sign-in, then exit')
    parser.add_argument('--profile', type=Path, default=DEFAULT_PROFILE, help='Dedicated Chrome profile outside the repository')
    parser.add_argument('--browser-binary', help='Optional Chrome or Chromium executable')
    parser.add_argument('--chromedriver', default=os.environ.get('CHROMEDRIVER'))
    parser.add_argument('--chrome-version', type=int, help='Chrome major version if automatic driver selection mismatches')
    parser.add_argument('--page-timeout', type=int, default=60)
    parser.add_argument('--verification-timeout', type=int, default=180,
                        help='Seconds to allow automatic browser verification before asking for help')


def login_if_requested(args):
    if not args.login:
        return False
    browser = Browser(args)
    try:
        browser.login()
    finally:
        browser.close()
    return True


class Browser:
    def __init__(self, args):
        import undetected_chromedriver as uc
        from selenium.webdriver.common.selenium_manager import SeleniumManager

        class SandboxedOptions(uc.ChromeOptions):
            def add_argument(self, argument):
                # UC 3.5.5 adds --no-sandbox even when no_sandbox=False.
                if argument not in ('--no-sandbox', '--disable-setuid-sandbox'):
                    super().add_argument(argument)

        self.args = args
        self.profile = args.profile.expanduser().resolve()
        if self.profile.is_relative_to(ROOT.parent.parent):
            raise ValueError('Keep the authentication profile outside the chelysis repository')
        self.profile.mkdir(parents=True, exist_ok=True)
        self.profile.chmod(0o700)
        self.driver = None
        self._driver_files = None
        try:
            browser_path = args.browser_binary
            driver_path = args.chromedriver
            if not driver_path:
                manager_args = ['--browser', 'chrome']
                if browser_path:
                    manager_args += ['--browser-path', browser_path]
                paths = SeleniumManager().binary_paths(manager_args)
                driver_path = paths['driver_path']
                browser_path = browser_path or paths['browser_path']
            # UC's own downloader selects the wrong macOS architecture. Patch a
            # temporary copy of Selenium's matching driver, not its shared cache.
            self._driver_files = tempfile.TemporaryDirectory(prefix='chelysis-driver-')
            patched_driver = Path(self._driver_files.name) / Path(driver_path).name
            shutil.copy2(driver_path, patched_driver)
            if sys.platform == 'darwin':
                uc.Patcher(executable_path=str(patched_driver), version_main=args.chrome_version).auto()
                # Patching invalidates the Mach-O signature. Sign this local copy
                # again rather than disabling macOS executable verification.
                subprocess.run(['codesign', '--force', '--sign', '-', str(patched_driver)],
                               check=True, capture_output=True)
            options = SandboxedOptions()
            options.accept_insecure_certs = False
            self.driver = uc.Chrome(
                options=options,
                user_data_dir=str(self.profile),
                browser_executable_path=browser_path,
                driver_executable_path=str(patched_driver),
                version_main=args.chrome_version,
                headless=False,
                no_sandbox=False,
            )
            self.driver.set_page_load_timeout(args.page_timeout)
            if args.page_timeout <= 0 or args.verification_timeout <= 0:
                raise ValueError('Page and verification timeouts must be positive')
            if not args.login:
                self.get('https://www.chess.com/home')
                self.wait('return typeof window.context?.user?.isGuest === "boolean"')
                if not self.signed_in():
                    raise RuntimeError('No signed-in Chess.com session. Run: python list_games.py --login')
        except BaseException:
            self.close()
            raise

    def get(self, url):
        from selenium.common.exceptions import TimeoutException
        self._target_url = url
        try:
            self.driver.get(url)
        except TimeoutException:
            # A verification page may keep loading even after navigation times out.
            print('Navigation is taking longer than expected; waiting for the page.', flush=True)

    def js(self, script):
        return self.driver.execute_script(script)

    def signed_in(self):
        return self.js('return window.context?.user?.isGuest === false') is True

    def login(self):
        self.get('https://www.chess.com/home')
        self.wait('return typeof window.context?.user?.isGuest === "boolean"')
        if not self.signed_in():
            self.get('https://www.chess.com/login')
            print('Sign into Chess.com in the Chrome window. Passwords are entered in the browser only.')
            try:
                input('After signing in, press Enter here: ')
            except EOFError as exc:
                raise RuntimeError('Sign-in needs an interactive terminal') from exc
            self.get('https://www.chess.com/home')
            self.wait('return typeof window.context?.user?.isGuest === "boolean"')
            if not self.signed_in():
                raise RuntimeError('Sign-in was not detected. Run --login again after completing it.')
        print(f'Signed in. Chrome keeps the session in: {self.profile}')

    def wait(self, script):
        from selenium.common.exceptions import JavascriptException, StaleElementReferenceException, TimeoutException
        deadline = time.monotonic() + self.args.page_timeout
        challenge_reported = False
        while True:
            try:
                value = self.js(script)
                if value:
                    if challenge_reported:
                        print('Browser verification finished; continuing.', flush=True)
                    return value
                challenge = self.js("""return /just a moment|attention required/i.test(document.title)
                    || /verifying you are human|checking your browser|performing security verification/i.test(document.body?.innerText||'')
                    || !!document.querySelector('#challenge-running, #cf-challenge-running, iframe[src*="challenges.cloudflare.com"]')""")
            except (JavascriptException, StaleElementReferenceException, TimeoutException):
                # DOM execution may race a redirect or automatic verification.
                challenge = False
            if challenge and not challenge_reported:
                challenge_reported = True
                deadline = max(deadline, time.monotonic() + self.args.verification_timeout)
                print('Browser verification detected; waiting for it to finish automatically.', flush=True)
            if time.monotonic() >= deadline:
                print(f'Waiting for page: {getattr(self, "_target_url", "current browser page")}', flush=True)
                print('The page is not ready. Complete any verification or sign-in in Chrome; '
                      'refresh the page there if needed. The current game will not be skipped.', flush=True)
                try:
                    input('When the page is ready, press Enter here to continue (Ctrl+C to stop): ')
                except EOFError as exc:
                    raise RuntimeError('Manual recovery needs an interactive terminal. Run the same command there to resume.') from exc
                target = getattr(self, '_target_url', None)
                # Signing in may redirect to /home. Return to the interrupted page.
                if target and self.driver.current_url != target:
                    self.get(target)
                deadline = time.monotonic() + self.args.page_timeout
                challenge_reported = False
            time.sleep(0.3)

    def game(self, gid):
        self.get(f'https://www.chess.com/analysis/game/master/{gid}/analysis')
        return self.wait(f'return String(window.chesscom?.analysis?.gameId) === {str(gid)!r} && window.chesscom?.analysis?.pgn ? window.chesscom.analysis : null')

    def cookie_header(self):
        # WebDriver reads the active session, including HttpOnly cookies. No disk extraction.
        cookies = {item['name']: item['value'] for item in self.driver.get_cookies()
                   if item['domain'].lstrip('.') in ('chess.com', 'analysis.chess.com')}
        return '; '.join(name + '=' + value for name, value in cookies.items())

    def close(self):
        try:
            if self.driver is not None:
                browser_pid = getattr(self.driver, 'browser_pid', None)
                try:
                    self.driver.quit()
                    # UC returns before Chrome finishes flushing its persistent profile.
                    if isinstance(browser_pid, int) and os.name == 'posix':
                        deadline = time.monotonic() + 5
                        while time.monotonic() < deadline:
                            try:
                                finished, _ = os.waitpid(browser_pid, os.WNOHANG)
                            except ChildProcessError:
                                break
                            if finished:
                                break
                            time.sleep(0.1)
                finally:
                    self.driver = None
        finally:
            if self._driver_files is not None:
                self._driver_files.cleanup()
                self._driver_files = None
