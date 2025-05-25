const getStoreSvc = (options) => () => {

    importScripts('/app/js/lib/jsstore.min.js');
    const connection = new JsStore.Connection(new Worker('/app/js/lib/jsstore.worker.min.js'));
    let db = null;


    function initSqlite(data) {
        importScripts(`/app/js/lib/sqlite3.js`);
        sqlite3InitModule().then(sqlite3 => {
            console.log("sqlite3 version", sqlite3.capi.sqlite3_libversion());
            db = new sqlite3.oo1.DB("mytemp.sqlite3", 'c');
            const colStr = Object.keys(data).filter(x => x != 'id').reduce((res, key) => {
                const type = typeof data[key];
                if (type === 'number') res += `${key} REAL, `;
                else if (type === 'boolean') res += `${key} BOOLEAN, `;
                else res += `${key} TEXT, `;
                return res;
            }, 'id integer PRIMARY KEY, ').slice(0, -2);
            db.exec(`CREATE TABLE IF NOT EXISTS mainTable (${colStr})`);
        }).then(async () => {
            let count = await new Promise((resolve, rej) => {
                db.exec({ sql: `SELECT COUNT(*) as count FROM mainTable`, callback: (res) => resolve(res[0]) });
            });
            if (count === 0) {
                console.log('loading data into sqlite3');
                const rows = await connection.select({ from: 'mainTable' });
                const tran = db.prepare([`INSERT INTO mainTable (${Object.keys(data).join(',')}) VALUES (${Object.keys(data).map(x => '?').join(',')})`])
                for (const row of rows) {
                    tran.bind(Object.values(row)).step();
                    tran.reset();
                }
                tran.finalize();
            }
            db.exec({
                sql: `SELECT count(id) as Count FROM mainTable`, callback: (res) => {
                    console.log('sqlite3 data loaded successfully, count:', res[0]);
                }
            });
        });
    }

    function getSelector({ startRow, endRow, sortBy, filterBy, groupBy, pivotBy }) {
        // pagination
        const selector = { from: 'mainTable', skip: startRow, limit: endRow - startRow };
        //sorting
        if (Array.isArray(sortBy) && sortBy.length) {
            selector.order = sortBy.map(({ key, order }) => ({ by: key, type: order }));
        }
        //filtering
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
        //grouping
        const builtinAgg = ['count', 'sum', 'avg', 'min', 'max'];
        if (groupBy && groupBy.fields?.length) {
            selector.groupBy = groupBy.fields;
            selector.aggregate = groupBy.aggs.
                filter(x => builtinAgg.includes(x.aggFunc))
                .reduce((acc, { field, aggFunc }) => {
                    acc[aggFunc] = Array.isArray(acc[aggFunc]) ? [...acc[aggFunc], field] : [field]
                    return acc;
                }, {})
            if (!Array.isArray(selector.aggregate.count)) {
                selector.aggregate.count = [groupBy.fields[0]]
            } else if (!selector.aggregate.count.includes(groupBy.field[0])) {
                selector.aggregate.count.push(groupBy.fields[0])
            }
        }
        //pivoting`
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
            options?.useSqlite && initSqlite(data);
            return count
        },
        query: async (request) => {
            const now = Date.now();
            const result = await connection.select(getSelector(request)).then(rows => {
                if (request.groupBy?.fields?.length) {
                    const key = request.groupBy.fields[0],
                        aggs = request.groupBy.aggs.map(x => ({ field: x.field, aggField: `${x.aggFunc}(${x.field})` }));
                    rows = rows.map(row => {
                        const newRow = { id: `${key}:${row[key]}`, ChildCount: row[`count(${key})`] };
                        request.groupBy.fields.forEach(field => newRow[field] = row[field]);
                        aggs.forEach(({ field, aggField }) => newRow[field] = row[aggField]);
                        return newRow;
                    });
                }
                console.log(`Data from IndexedDB: ${rows.length} rows on ${Date.now() - now}ms`); //rows
                return rows;
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