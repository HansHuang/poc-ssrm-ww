(async () => {

    importScripts('/app/js/dataSvc.js');
    importScripts('/app/js/storeSvc.js');

    let idList = [];
    const storeSvc = getStoreSvc({})(),
        dataSvc = getDataSvc({
            targetSize: 10 * 1000,
            JsStore,
            onInitLoad: (rows) => {
                idList = rows.map(x => x.id);
                storeSvc.clear();
                storeSvc.upsert(rows);
            },
            onNextLoad: (rows) => {
                // postMessage({ type: 'transaction', payload: { add: rows } });
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

    const initRow = await dataSvc.init();
    if (!initRow) {
        console.error('Failed to initialize data service');
        return;
    }
    const count = await storeSvc.init(initRow);
    if (count < 100) {
        console.log('IndexedDB is empty, loading data...');
        await dataSvc.load();
    }
    postMessage({ type: 'initRow', payload: initRow });

    // dataSvc.listen();

    // webworker query/response
    onmessage = async function (e) {
        const { uuid, type, payload } = e.data;
        if (type === 'getRows') {
            console.log(payload);
            const { startRow, endRow, filterModel, sortModel: sortBy } = payload;
            const filterBy = Object.keys(filterModel).map(key => {
                const { filter, filterType, filterTo, type } = filterModel[key];
                return { key, value: filter, value2: filterTo, operator: type, dataType: filterType };
            });
            payload.groupKeys.forEach((val, index) => {
                const col = payload.rowGroupCols[index];
                filterBy.push({ key: col.field, value: val, operator: 'equals' });
            });
            let groupBy, pivotBy;
            if (!payload.pivotMode && payload.rowGroupCols.length > payload.groupKeys.length) {
                groupBy = {
                    fields: payload.rowGroupCols
                        .filter((_, i) => i + 1 > payload.groupKeys.length)
                        .map(col => col.field),
                    aggs: payload.valueCols.map(col => ({ field: col.field, aggFunc: col.aggFunc }))
                }
            }
            if (payload.pivotMode) {
            }

            const rows = await storeSvc.query({ startRow, endRow, filterBy, sortBy, groupBy, pivotBy });
            postMessage({ uuid, type: 'resRows', payload: { rows } });
        }
    };

})()