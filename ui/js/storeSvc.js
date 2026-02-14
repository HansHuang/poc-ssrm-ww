const getStoreSvc = (options) => () => {

    importScripts('/app/js/lib/jsstore.min.js');
    const connection = new JsStore.Connection(new Worker('/app/js/lib/jsstore.worker.min.js'));
    let db = null;


    function initSqlite(data) {
        importScripts(`/app/js/lib/sqlite3.js`);
        return sqlite3InitModule().then(sqlite3 => {
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
            return db;
        }).then(async (database) => {
            let countResult = await new Promise((resolve, reject) => {
                database.exec({ sql: `SELECT COUNT(*) as count FROM mainTable`, callback: (res) => resolve(res[0]) });
            });
            const count = countResult?.count || 0;
            if (count === 0) {
                console.log('loading data into sqlite3');
                const rows = await connection.select({ from: 'mainTable' });
                // Use the same key order as the table was created
                const keys = ['id', ...Object.keys(data).filter(x => x !== 'id')];
                const tran = database.prepare(`INSERT INTO mainTable (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`);
                for (const row of rows) {
                    const values = keys.map(key => {
                        const val = row[key];
                        if (val === null || val === undefined) return null;
                        if (typeof val === 'object') return JSON.stringify(val);
                        if (typeof val === 'boolean') return val ? 1 : 0;
                        return val;
                    });
                    tran.bind(values).step();
                    tran.reset();
                }
                tran.finalize();
            }
            return new Promise((resolve, reject) => {
                database.exec({
                    sql: `SELECT count(id) as Count FROM mainTable`,
                    callback: (res) => {
                        console.log('sqlite3 data loaded successfully, count:', res[0]);
                        resolve(res[0]);
                    }
                });
            });
        }).catch(error => {
            console.error('Error initializing sqlite3:', error);
            throw error;
        });
    }

    async function queryJsStore({ startRow, endRow, sortBy, filterBy, groupBy, pivotBy }) {
        // pagination
        const selector = { from: 'mainTable', skip: startRow, limit: endRow - startRow };
        //sorting
        if (Array.isArray(sortBy) && sortBy.length) {
            selector.order = sortBy.map(({ key, order }) => ({ by: key, type: order }));
        }
        //filtering
        const where = buildWhereClause(filterBy);
        if (where) {
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
        return await connection.select(selector)
    }

    function buildWhereClause(filterBy) {
        if (!Array.isArray(filterBy) || !filterBy.length) {
            return null;
        }
        const where = {};
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
        return where;
    }

    function buildSqlWhereClause(filterBy) {
        if (!Array.isArray(filterBy) || !filterBy.length) {
            return { sql: '', params: [] };
        }
        
        const whereClauses = [];
        const params = [];
        
        filterBy.forEach(({ key, value, value2, operator }) => {
            if (operator === 'equals') {
                whereClauses.push(`${key} = ?`);
                params.push(value);
            } else if (operator === 'notEquals') {
                whereClauses.push(`${key} != ?`);
                params.push(value);
            } else if (operator === 'contains') {
                whereClauses.push(`${key} LIKE ?`);
                params.push(`%${value}%`);
            } else if (operator === 'startsWith') {
                whereClauses.push(`${key} LIKE ?`);
                params.push(`${value}%`);
            } else if (operator === 'endsWith') {
                whereClauses.push(`${key} LIKE ?`);
                params.push(`%${value}`);
            } else if (operator === 'greaterThan') {
                whereClauses.push(`${key} > ?`);
                params.push(value);
            } else if (operator === 'lessThan') {
                whereClauses.push(`${key} < ?`);
                params.push(value);
            } else if (operator === 'greaterThanOrEqual') {
                whereClauses.push(`${key} >= ?`);
                params.push(value);
            } else if (operator === 'lessThanOrEqual') {
                whereClauses.push(`${key} <= ?`);
                params.push(value);
            } else if (operator === 'inRange') {
                whereClauses.push(`${key} BETWEEN ? AND ?`);
                params.push(value, value2);
            } else if (operator === 'blank') {
                whereClauses.push(`${key} IS NULL`);
            } else if (operator === 'isNotNull') {
                whereClauses.push(`${key} IS NOT NULL`);
            }
        });
        
        return {
            sql: whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : '',
            params
        };
    }

    async function querySqlite({ startRow, endRow, sortBy, filterBy, groupBy, pivotBy }) {
        if (!db) {
            throw new Error('SQLite database not initialized');
        }

        let sql = 'SELECT ';
        const params = [];
        
        // Grouping and aggregation
        if (groupBy && groupBy.fields?.length) {
            const fields = groupBy.fields.join(', ');
            const countField = `COUNT(${groupBy.fields[0]}) as 'count(${groupBy.fields[0]})'`;
            const aggs = groupBy.aggs.map(({ field, aggFunc }) => {
                const func = aggFunc.toUpperCase();
                return `${func}(${field}) as '${aggFunc}(${field})'`;
            }).join(', ');
            
            // Build select list
            const selectParts = [fields, countField];
            if (aggs) {
                selectParts.push(aggs);
            }
            sql += selectParts.join(', ');
        } else {
            sql += '*';
        }
        
        sql += ' FROM mainTable';
        
        // Filtering
        const whereClause = buildSqlWhereClause(filterBy);
        sql += whereClause.sql;
        params.push(...whereClause.params);
        
        // Grouping
        if (groupBy && groupBy.fields?.length) {
            sql += ` GROUP BY ${groupBy.fields.join(', ')}`;
        }
        
        // Sorting
        if (Array.isArray(sortBy) && sortBy.length) {
            const orderBy = sortBy.map(({ key, order }) => 
                `${key} ${order.toUpperCase()}`
            ).join(', ');
            sql += ` ORDER BY ${orderBy}`;
        }
        
        // Pagination
        sql += ` LIMIT ? OFFSET ?`;
        params.push(endRow - startRow, startRow);
        
        console.log('SQLite query:', sql, params);
        
        // Execute query
        return new Promise((resolve, reject) => {
            try {
                const results = [];
                db.exec({
                    sql: sql,
                    bind: params,
                    rowMode: 'object',
                    callback: (row) => {
                        results.push(row);
                    }
                });
                resolve(results);
            } catch (error) {
                reject(error);
            }
        });
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
            if (options?.useSqlite) {
                await initSqlite(data);
            }
            return count
        },
        query: async (request) => {
            const now = Date.now();
            const queryFn = options?.useSqlite ? querySqlite : queryJsStore;
            const source = options?.useSqlite ? 'SQLite' : 'IndexedDB';
            
            const result = await queryFn(request).then(rows => {
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
                console.log(`Data from ${source}: ${rows.length} rows on ${Date.now() - now}ms`);
                return rows;
            }).catch(error => {
                console.error(`Error reading data from ${source}:`, error);
                return [];
            });
            return result
        },
        getCount: async (filterBy) => {
            if (options?.useSqlite && db) {
                // Use SQLite for count
                let sql = 'SELECT COUNT(*) as count FROM mainTable';
                const whereClause = buildSqlWhereClause(filterBy);
                sql += whereClause.sql;
                
                return new Promise((resolve, reject) => {
                    try {
                        let count = 0;
                        db.exec({
                            sql: sql,
                            bind: whereClause.params,
                            callback: (row) => {
                                count = row[0];
                            }
                        });
                        resolve(count);
                    } catch (error) {
                        reject(error);
                    }
                });
            } else {
                // Use IndexedDB for count
                const selector = { from: 'mainTable' };
                const where = buildWhereClause(filterBy);
                if (where) {
                    selector.where = where;
                }
                return await connection.count(selector);
            }
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