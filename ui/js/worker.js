(async () => {

    importScripts('/app/js/dataSvc.js');
    importScripts('/app/js/storeSvc.js');

    const dataCache = [],
        storeSvc = getStoreSvc({

        })(),
        dataSvc = getDataSvc({
            targetSize: 100 * 1000,
            JsStore,
            onInitLoad: (rows) => {
                dataCache.splice(0, dataCache.length, ...rows);
                postMessage({ type: 'fullData', payload: dataCache });
                storeSvc.clear();
                storeSvc.upsert(rows);
            },
            onNextLoad: (rows) => {
                dataCache.push(...rows);
                postMessage({ type: 'transaction', payload: { add: rows } });
                storeSvc.upsert(rows);
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
                storeSvc.upsert(rows);
            }
        })();

    const cachedData = await storeSvc.load()
    if (Array.isArray(cachedData) && cachedData.length) {
        dataCache.splice(0, dataCache.length, ...cachedData);
        postMessage({ type: 'fullData', payload: dataCache });
    } else {
        console.log('No data in IndexedDB, starting to load from server');
        await dataSvc.load();
    }

    // dataSvc.listen();

})()