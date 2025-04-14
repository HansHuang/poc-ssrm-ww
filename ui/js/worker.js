(async () => {

    // importScripts(`/app/js/sqlite3.js`);
    // sqlite3InitModule().then(sqlite3 => sqlite3.initWorker1API());
    // sqlite3.initWorker1API = () => {
    //     console.log('sqlite3 worker1 api initialized');
    //     postMessage({ type: 'sqlite3-api', result: 'worker1-ready' });
    // };
    // sqlite3.initWorker1API();

    
    importScripts('/app/js/dataSvc.js');
    importScripts('/app/js/storeSvc.js');

    const dataCache = [],
        storeSvc = getStoreSvc({
            
        })(),
        dataSvc = getDataSvc({
            targetSize: 1 * 1000,
            JsStore,
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
    await storeSvc.load()



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