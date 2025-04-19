(async () => {

    importScripts('/app/js/dataSvc.js');
    importScripts('/app/js/storeSvc.js');

    let idList = [];
    const storeSvc = getStoreSvc({})(),
        dataSvc = getDataSvc({
            targetSize: 100 * 1000,
            JsStore,
            onInitLoad: (rows) => {
                postMessage({ type: 'fullData', payload: rows });
                idList = rows.map(x => x.id);
                storeSvc.clear();
                storeSvc.upsert(rows);
            },
            onNextLoad: (rows) => {
                postMessage({ type: 'transaction', payload: { add: rows } });
                rows.forEach(row => idList.push(row.id));
                storeSvc.upsert(rows);
            },
            onRealtime: (rows) => {
                const transaction = { add: [], update: [] };
                rows.forEach(row => {
                    if (idList.indexOf(row.id) > -1) {
                        transaction.update.push(row);
                    } else {
                        idList.push(row.id);
                        transaction.add.push(row);
                    }
                });
                postMessage({ type: 'transaction', payload: transaction });
                storeSvc.upsert(rows);
            }
        })();

    const cachedData = await storeSvc.load()
    if (Array.isArray(cachedData) && cachedData.length) {
        postMessage({ type: 'fullData', payload: cachedData });
        idList = cachedData.map(x => x.id);
    } else {
        console.log('No data in IndexedDB, starting to load from server');
        await dataSvc.load();
    }

    // dataSvc.listen();

})()