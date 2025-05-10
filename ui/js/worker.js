(async () => {

    importScripts('/app/js/dataSvc.js');
    importScripts('/app/js/storeSvc.js');

    let idList = [];
    const storeSvc = getStoreSvc({useSqlite: true})(),
        dataSvc = getDataSvc({
            targetSize: 100 * 1000,
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
            //sorting
            const sortBy = payload.sortModel.filter(x => !x.colId.startsWith('ag-Grid')).map(x => ({ key: x.colId, order: x.sort })),
                { startRow, endRow, filterModel } = payload;
            //filtering
            const filterBy = Object.keys(filterModel).map(key => {
                const { filter, filterType, filterTo, type } = filterModel[key];
                return { key, value: filter, value2: filterTo, operator: type, dataType: filterType };
            });
            payload.groupKeys.forEach((val, index) => {
                const col = payload.rowGroupCols[index];
                filterBy.push({ key: col.field, value: val, operator: 'equals' });
            });
            //grouping
            let groupBy;
            if (payload.rowGroupCols.length > payload.groupKeys.length) {
                groupBy = {
                    fields: [payload.rowGroupCols[payload.groupKeys.length].field,
                    ...((payload.pivotCols ?? []).map(col => col.field))],
                    aggs: payload.valueCols.map(col => ({ field: col.field, aggFunc: col.aggFunc }))
                }
            }
            // query
            const rows = await storeSvc.query({ startRow, endRow, filterBy, sortBy, groupBy });
            if (!payload.pivotMode) {
                postMessage({ uuid, type: 'resRows', payload: { rows } });
                return;
            }
            //process pivoting result
            const rowFields = [payload.rowGroupCols[payload.groupKeys.length].field],
                columnFields = payload.pivotCols.map(col => col.field),
                valueFields = payload.valueCols.map(({ field, aggFunc }) => ({ field, aggFunc }));
            const pivotColKeys = [],
                pivotData = [],
                pivotCols = [];
            rows.forEach((row, index) => {
                const newRow = pivotData.find(x => rowFields.every(key => x[key] === row[key]))
                    ?? rowFields.reduce((acc, key) => ({ ...acc, [key]: row[key] }), {});

                newRow.ChildCount = (row.ChildCount ?? 0) + (row.ChildCount ?? 0);
                newRow.id = `${index}_${row[rowFields[0]]}`;

                valueFields.forEach(({ field, aggFunc }) => {
                    const colKey = [...columnFields.map(x => row[x]), field].join('_'),
                        headerName = `${aggFunc}(${field})`;
                    newRow[colKey] = row[field]
                    if (pivotColKeys.every(x => x.colKey !== colKey)) pivotColKeys.push({ colKey, headerName });
                });
                if (!pivotData.includes(newRow)) pivotData.push(newRow);
            });

            const getPivotCols = (cols, keys, level) => {
                const groupId = keys.slice(0, level + 1).join('_'),
                    node = cols.find(x => x.groupId === groupId) ?? { groupId, children: [], headerName: keys[level] };
                if (!cols.includes(node)) cols.push(node);
                if (keys.length === level + 1) return node.children;
                return getPivotCols(node.children, keys, level + 1);
            }
            pivotColKeys.forEach(({ colKey, headerName }) => {
                const item = { headerName, colId: colKey, field: colKey };
                if (!colKey.includes('_')) {
                    pivotCols.push(item)
                    return
                }
                const keys = colKey.split('_').slice(0, -1),
                    cols = getPivotCols(pivotCols, keys, 0);
                cols.push(item);
            });
            console.log('pivotData:', pivotData, 'pivotCols:', pivotCols)
            postMessage({ uuid, type: 'resRows', payload: { rows: pivotData, pivotCols } });
        }
    };

})()