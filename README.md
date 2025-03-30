# poc-ssrm-ww
Hack SSRM (Server-Side-Row-Mode) on WebWorker with WebAssembly SQLite+IndexedDB

## Background
[SSRM](https://www.ag-grid.com/javascript-data-grid/server-side-model/) is good choice for large data presenting/browsing/analysis on the fly, large data at million to billion level. Frontend only display very small set of data, like aggregation/group result or slice of pagination; the server or data layer is responsible for data calculation. With power of analytics data layer like ElasticSearch, Apache Pinot etc. billions of data can be played in hundreds milliseconds level.

For mid-size of data like 100K ~ 1M rows, I'm thinking hack the SSRM, use WebWorker instead of backend server for data processing. Of cause still need backend server to pull data, but SSRM calculation is in WebWorker. Below benefits can be addressed:

1. Light-weight UI thread as __real__ SSRM
2. Only one initial data loading time, no following server fetching time for pagination, pivoting... (post message time form WebWorker can be ignored)
3. Realtime aggregation will be earlier (UI state for backend is painful)

## How

1. Config AgGrid SSRM
2. Load all data in WebWorker, stored in Sqlite, persist in IndexDB
3. Build query to Sqlite from AgGrid/UI request, like in ES or Pinot.