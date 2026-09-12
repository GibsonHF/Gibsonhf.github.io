# Live players relay

Cloudflare Worker that holds the latest position and vitals per player, grouped by key.
Clients `POST /push`; the map page `GET /players?keys=…`. State lives in memory and expires after 30 s.

## Run locally

    npm install
    npm run dev

Then push a fake player:

    curl -X POST http://localhost:8787/push -H 'Content-Type: application/json' \
      -d '{"key":"<32 hex chars>","name":"Test","x":3200,"y":3200,"plane":0,"hp":990,"maxHp":990}'
    curl 'http://localhost:8787/players?keys=<32 hex chars>'

`scripts/fake_players.mjs <relay-url> <key>` pushes three moving players every 2 s.

## Run without Cloudflare

    ./run_local.sh [port]

or `node server.mjs [port]`. The script prints the URLs to enter.

Same endpoints, kept in this process's memory. Point clients at `http://<your-ip>:<port>`.
A browser will only call it from an `http://` copy of the map (`node server.js` in the repo root, then `http://localhost:8080`, or any other localhost port) or if you put HTTPS in front of it; the GitHub Pages site cannot call a plain `http://` address.

## Deploy

    npx wrangler login
    npx wrangler deploy --name <pick-something-random>

The `--name` becomes the public hostname, so pick something unguessable and do not write the resulting URL into this repo.
Enter the URL in the map's Live Players panel and give it to anyone whose client should push to it.

## Tests

    npm test
