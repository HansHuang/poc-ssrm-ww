const getStoreSvc = (options) => () => {

    importScripts('/app/js/jsstore.min.js');
    const connection = new JsStore.Connection(new Worker('/app/js/jsstore.worker.min.js'));


    return {
        load: async () => {
            console.log('Start read data IndexedDB');
            const [data] = await fetch('/api/rows?_page=1&_size=1').then(r => r.json()),
                colDef = Object.keys(data).reduce((res, key) => {
                    res[key] = { datetype: typeof data[key] }
                    return res;
                }, {});
            Object.assign(colDef.id, { primaryKey: true, autoIncrement: false })

            const isExisted = await connection.initDb({ name: "mainDB", tables: [{ name: "mainTable", columns: colDef }] });
            console.log('Database initialized:', isExisted);
            const mainData = await connection.select({
                from: 'mainTable'
            }).then(x => {
                console.log('Data from IndexedDB:', x);
                return x;
            }).catch(error => {
                console.error('Error reading data from IndexedDB:', error);
                return [];
            });
            console.log('Main data:', mainData);
            return mainData
        }
    }

}