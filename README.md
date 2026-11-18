# BDIX Check

[Open BDIX Check](https://youroi.github.io/bdix-check/) on the broadband connection you want to test. Use a current version of Chrome and choose **Allow** when asked for Local Network Access. The first round starts when the page opens. With the tab visible, a new round starts one minute after the previous round finishes. Use **Check now** to start a round manually.

GitHub Pages serves the dashboard and endpoint list. Your browser sends credential-free HTTP HEAD requests directly to the URLs in batches of 12. Results update after each batch. An unconfirmed check can mean the browser blocked the request or your ISP could not reach that endpoint. Browsers can block plain HTTP on public addresses, and cross-origin responses often hide the exact status code. Raw FTP on port 21 requires an FTP client.

The [catalogue](docs/servers.json) contains 374 distinct web URLs. The original entries cover [ICC](https://bdix.app/servers/icc-ftp-server), [Dhaka Flix](https://bdix.app/servers/dhaka-flix), [SamOnline](https://bdix.app/servers/samonline-ftp), and [Circle](https://bdix.app/servers/circle-ftp). The larger list is sourced from GitHub and deduplicated by host, port, and path. [Sources and licenses](THIRD-PARTY-NOTICES.md)

Run `npm test` to verify the browser check logic, batch limits, and URL list.
