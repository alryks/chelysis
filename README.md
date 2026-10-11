# Chelysis

Chelysis is a React chess analysis interface with board navigation, move analysis, an evaluation bar, and bundled Stockfish assets.

## Stack

- React 19
- Create React App / `react-scripts`
- Redux Toolkit
- `chess.js`
- `react-chessboard`
- Stockfish WebAssembly served from `public/stockfish`

## Requirements

- Node.js 20+
- npm
- Docker, optional for containerized production runs

## Local Development

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm start
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Production Build

Create an optimized static build:

```sh
npm run build
```

The output is written to `build/`.

## Docker

Build and run the production container with Compose:

```sh
docker compose up --build -d
```

Open [http://localhost:3000](http://localhost:3000).

Stop the container:

```sh
docker compose down
```

Or build and run the image directly:

```sh
docker build -t chelysis-frontend .
docker run --rm -p 3000:80 chelysis-frontend
```

The container builds the React app and serves the static output with nginx.

### Private Fedora deployment

Keep the deployment checkout at `/opt/chelysis` on the SSD. Compose binds
port 3000 to localhost; override it with `CHELYSIS_PORT` if necessary.
The container restarts after Docker or the host restarts, unless manually stopped.

```sh
cd /opt/chelysis
sudo docker compose up --build -d
sudo tailscale serve --bg http://127.0.0.1:3000
sudo tailscale serve status
```

Open the HTTPS URL reported by Tailscale Serve from a device connected to your
tailnet. Serve's background configuration persists across reboots. Docker and
Tailscale must both be enabled as system services; no graphical login is needed.
This does not publish the application to the public Internet.

## Scripts

```sh
npm start
```

Runs the app in development mode.

```sh
npm run build
```

Builds the production bundle.

```sh
npm test
```

Starts the Create React App test runner.

## Project Layout

```text
public/
  stockfish/        Stockfish JavaScript and WASM files
src/
  components/       UI components
  state/            Redux store, slices, and Stockfish service
  assets/           Static application data
Dockerfile          Production container build
docker-compose.yml  Local container runner
nginx.conf          Static server config
```
