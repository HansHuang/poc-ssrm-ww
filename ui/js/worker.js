(async () => {

    // importScripts(`/app/js/sqlite3.js`);
    // sqlite3InitModule().then(sqlite3 => sqlite3.initWorker1API());
    // sqlite3.initWorker1API = () => {
    //     console.log('sqlite3 worker1 api initialized');
    //     postMessage({ type: 'sqlite3-api', result: 'worker1-ready' });
    // };
    // sqlite3.initWorker1API();

    importScripts('https://cdn.jsdelivr.net/npm/jsstore@4.0.0/dist/jsstore.min.js');
    importScripts('/app/js/dataSvc.js');

    const dataCache = [],
        dataSvc = getDataSvc({
            targetSize: 10 * 1000,
            onInitLoad: (rows) => {
                dataCache.splice(0, dataCache.length, ...rows);
                postMessage({ type: 'fullData', payload: dataCache });
            },
            onNextLoad: (rows) => {
                dataCache.push(...rows);
                postMessage({ type: 'transaction', payload: { add: rows } });
            },
            onRealtime: (rows) => {
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
            }
        })();
    await dataSvc.load();
    // dataSvc.listen();
    console.log('Data service initialized');

    console.log('Loading data from IndexedDB...');
    await new Promise(resolve => {
        const dbRequest = indexedDB.open('MainDB', 1);
        dbRequest.onerror = event => console.error('Error opening IndexedDB:', event);
        dbRequest.onsuccess = function (event) {
            const db = event.target.result;
            if (db.objectStoreNames.contains('MainStore')) {
                console.log('Object store exists, loading data...');
                const transaction = db.transaction('MainStore', 'readonly');
                const store = transaction.objectStore('MainStore');
                const rows = store.getAll();
                rows.onsuccess = function (event) {
                    const data = event.target.result;
                    if (data.length > 0) {
                        console.log('Data loaded from IndexedDB:', data);
                        dataCache.splice(0, dataCache.length, ...data);
                        postMessage({ type: 'fullData', payload: data });
                    } else {
                        console.log('No data found in IndexedDB');
                    }
                    resolve();
                };
                rows.onerror = event => {
                    console.error('Error reading from IndexedDB:', event);
                    resolve();
                };
            } else {
                resolve();
            }
        };
    })


    // const dbRequest = indexedDB.open('MainDB', 1);
    // dbRequest.onerror = event => console.error('Error opening IndexedDB:', event);
    // dbRequest.onsuccess = function (event) {
    //     const db = event.target.result;
    //     if (!db.objectStoreNames.contains('MainStore')) {
    //         const store = db.createObjectStore('MainStore', { keyPath: 'id' });
    //         store.createIndex('id', 'id', { unique: true });
    //         console.log('Object store created');
    //         store.transaction.oncomplete = function () {
    //             const table = db.transaction('MainStore', 'readwrite').objectStore('MainStore');
    //             dataCache.forEach(row => table.add(row));
    //             table.oncomplete = function () {
    //                 console.log('All data written to IndexedDB');
    //             };
    //             table.onerror = function (event) {
    //                 console.error('Error writing to IndexedDB:', event);
    //             };
    //         };
    //     }         
    // }


})()