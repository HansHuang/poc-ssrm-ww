const getStoreSvc = (options) => () => {

    importScripts('/app/js/lib/jsstore.min.js');
    const connection = new JsStore.Connection(new Worker('/app/js/lib/jsstore.worker.min.js'));


    return {
        load: async () => {
            const [data] = await fetch('/api/rows?_page=1&_size=1').then(r => r.json()),
                colDef = Object.keys(data).reduce((res, key) => {
                    res[key] = { datetype: typeof data[key] }
                    return res;
                }, {});
            Object.assign(colDef.id, { primaryKey: true, autoIncrement: false })

            await connection.initDb({ name: "mainDB", tables: [{ name: "mainTable", columns: colDef }] });
            const mainData = await connection.select({
                from: 'mainTable'
            }).then(x => {
                console.log('Data from IndexedDB:', x.length);
                return x;
            }).catch(error => {
                console.error('Error reading data from IndexedDB:', error);
                return [];
            });
            return mainData
        },
        upsert: async (rows) => {
            const result = await connection.insert({
                into: 'mainTable',
                upsert: true,
                values: rows
            });
            console.log('Data inserted into IndexedDB:', result);
        },
        clear: async () => {
            await connection.clear('mainTable');
            console.log('data cleared successfully');
        },
    }

}