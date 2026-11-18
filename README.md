# BDIX Check

[Open BDIX Check](https://youroi.github.io/bdix-check/) on the broadband connection you want to test. Use a current version of Chrome and choose **Allow** when asked for Local Network Access. Checks start when the page opens, repeat every minute while the tab is visible, and can be rerun with **Check now**.

GitHub Pages serves the dashboard and endpoint list. The browser sends credential-free HTTP HEAD requests directly to each listed endpoint. The dashboard shows whether the browser received a response and how long it took. An unconfirmed check can mean the browser blocked the request or your ISP could not reach that endpoint. Cross-origin responses often hide the exact status code. Raw FTP on port 21 requires an FTP client.

Edit [docs/servers.json](docs/servers.json) to update the list. The starter endpoints are publicly listed for [ICC](https://bdix.app/servers/icc-ftp-server), [Dhaka Flix](https://bdix.app/servers/dhaka-flix), [SamOnline](https://bdix.app/servers/samonline-ftp), and [Circle](https://bdix.app/servers/circle-ftp).

Run `npm test` to exercise the browser check logic with simulated HTTP responses.
