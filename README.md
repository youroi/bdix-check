# BDIX Check

BDIX server availability from the network where the checker runs. It checks on startup and repeats 60 seconds after each round, even with the browser closed. The dashboard has a manual check, search, status filters, and response times.

## Run

On a computer connected to the ISP you want to test, use Node.js 24 or later:

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The app uses built-in Node.js modules and listens on loopback. If port 4173 is occupied, set `BDIX_PORT` to a free port before starting.

## Server list

Edit [servers.json](servers.json) and restart. Each entry has a `name`, `provider`, and `url`. Use `http://` or `https://` for a media page and `ftp://` for an FTP greeting check. Explicit ports are supported. Each endpoint has a five-second deadline. An HTTP redirect is reported separately, and FTP availability means the server sent a ready greeting. A failed connection describes what this checker could reach from its network.

The starter list uses published addresses for [ICC Media](https://bdix.app/servers/icc-ftp-server), [Dhaka Flix](https://bdix.app/servers/dhaka-flix), [SamOnline](https://bdix.app/servers/samonline-ftp), and [Circle](https://bdix.app/servers/circle-ftp).

Run `npm test` to exercise the checker against local HTTP and FTP fixtures.
