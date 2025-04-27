const getStoreSvc = (options) => () => {

    importScripts('/app/js/lib/jsstore.min.js');
    const connection = new JsStore.Connection(new Worker('/app/js/lib/jsstore.worker.min.js'));

    function getSelector({ startRow, endRow, sortBy, filterBy, groupBy, pivotBy }) {
        const selector = {
            from: 'mainTable',
            skip: startRow,
            limit: endRow - startRow
        };
        if (Array.isArray(sortBy) && sortBy.length) {
            selector.order = sortBy.map(({ colId, sort }) => ({ by: colId, type: sort }));
        }
        if (Array.isArray(filterBy) && filterBy.length) {
            const where = {}
            filterBy.forEach(({ key, value, value2, operator, dataType }) => {
                if (operator === 'equals') {
                    where[key] = value;
                } else if (operator === 'notEquals') {
                    where[key] = { '!=': value }
                } else if (operator === 'contains') {
                    where[key] = { like: `%${value}%` }
                } else if (operator === 'notContains') {
                    // where[key] = { [dataType]: { notLike: `%${value}%` } };
                } else if (operator === 'startsWith') {
                    where[key] = { like: `${value}%` };
                } else if (operator === 'endsWith') {
                    where[key] = { like: `%${value}` };
                } else if (operator === 'greaterThan') {
                    where[key] = { '>': value }
                } else if (operator === 'lessThan') {
                    where[key] = { '<': value }
                } else if (operator === 'greaterThanOrEqual') {
                    where[key] = { '>=': value }
                } else if (operator === 'lessThanOrEqual') {
                    where[key] = { '<=': value };
                } else if (operator === 'inRange') {
                    where[key] = { '-': { low: value, high: value2 } };
                } else if (operator === 'blank') {
                    where[key] = null
                } else if (operator === 'isNotNull') {
                    where[key] = { '!=': null }
                }
            });
            selector.where = where;
        }
        const builtinAgg = ['count', 'sum', 'avg', 'min', 'max'];
        if (groupBy && groupBy.fields?.length) {
            selector.groupBy = [groupBy.fields[0]];
            // TODO: merge agg function for multiple fields
            selector.aggregate = groupBy.aggs.reduce((acc, { field, aggFunc }) => {
                if (builtinAgg.includes(aggFunc)) {
                    acc[aggFunc] = field;
                }
                return acc;
            }, {});
            Object.assign(selector.aggregate, { count: groupBy.fields[0] });
            if (!groupBy.aggs.length) {
                selector.aggregate = { count: groupBy.fields[0] }
            }
        }
        if (Array.isArray(pivotBy) && pivotBy.length) {
            selector.pivot = pivotBy;
        }
        console.log('Selector:', selector);
        return selector;
    }


    return {
        init: async (data) => {
            const colDef = Object.keys(data).reduce((res, key) => {
                res[key] = { datetype: typeof data[key] }
                return res;
            }, {});
            Object.assign(colDef.id, { primaryKey: true, autoIncrement: false })

            await connection.initDb({ name: "mainDB", tables: [{ name: "mainTable", columns: colDef }] });
            const count = await connection.count({ from: 'mainTable' });
            console.log('IndexedDB initialized successfully, count:', count);
            return count
        },
        query: async (request) => {
            const now = Date.now();
            const result = await connection.select(getSelector(request)).then(x => {
                if (request.groupBy?.fields?.length) {
                    const key = request.groupBy.fields[0];
                    //TODO: leave agg values
                    x = x.map(row => ({ id: `${key}:${row[key]}`, [key]: row[key], ChildCount: row[`count(${key})`] }));
                }
                console.log(`Data from IndexedDB: ${x.length} rows on ${Date.now() - now}ms`, x);
                return x;
            }).catch(error => {
                console.error('Error reading data from IndexedDB:', error);
                return [];
            });
            return result
        },
        upsert: async (rows) => {
            const count = await connection.insert({ into: 'mainTable', upsert: true, values: rows });
            console.log(`[${new Date().toLocaleString()}] Data inserted into IndexedDB: ${count} rows`);
            return count;
        },
        clear: async () => {
            await connection.clear('mainTable');
            console.log('data cleared successfully');
        },
    }

}