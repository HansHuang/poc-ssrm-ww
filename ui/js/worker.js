(async () => {

    importScripts(`/app/js/sqlite3.js`);
    sqlite3InitModule().then(sqlite3 => sqlite3.initWorker1API());
    // sqlite3.initWorker1API = () => {
    //     console.log('sqlite3 worker1 api initialized');
    //     postMessage({ type: 'sqlite3-api', result: 'worker1-ready' });
    // };
    // sqlite3.initWorker1API();

    const dataCache = []

    fetch('/api/rows')
        .then(response => response.json())
        .then(data => {
            dataCache.splice(0, dataCache.length, ...data);

            postMessage({ type: 'fullData', payload: dataCache });
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });

    function startWebSocket(isReconnect) {
        console.log(`${isReconnect ? 'Reconnecting' : 'Connecting'} to WebSocket...`);
        const ws = new WebSocket(`ws://${location.host}/ws`);
        ws.onopen = () => {
            isReconnect && console.clear();
            console.log('WebSocket is open now.');
            ws.onclose = () => {
                console.log('WebSocket is closed now.')
                setTimeout(() => startWebSocket(true), 3000);
            };
        }
        ws.onerror = (event) => {
            console.error('WebSocket error observed:', event);
            setTimeout(() => startWebSocket(true), 3000);
        };

        ws.onmessage = function (event) {
            const msg = JSON.parse(event.data),
                { rows } = msg;

            const transaction = { add: [], update: [] };
            rows.forEach(row => {
                const index = dataCache.findIndex(x => x.id === row.id);
                if (index > -1) {
                    dataCache[index] = row;
                    transaction.update.push(row);
                } else {
                    dataCache.push(row);
                    transaction.add.push(row);
                }
            });

            postMessage({ type: 'transaction', payload: transaction });
        };
    }
    startWebSocket();
})()