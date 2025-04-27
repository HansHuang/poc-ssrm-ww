(async () => {

    const gridOptions = {
        theme: agGrid.themeBalham,
        rowModelType: 'serverSide',
        cacheBlockSize: 200,
        maxBlocksInCache: 3,
        loading: true,
        autoSizeStrategy: {
            type: 'fitCellContents'
        },
        defaultColDef: {
            filter: true,
            floatingFilter: true,
            sortable: true,
            enableCellChangeFlash: true,
            enableRowGroup: true,
            enablePivot: true,
            enableValue: true
        },
        sideBar: true,
        statusBar: {
            statusPanels: [
                { statusPanel: "agSelectedRowCountComponent" },
                { statusPanel: "agAggregationComponent" },
            ],
        },
        getRowId: (params) => String(params.data.id),
        getChildCount: (data) => data.ChildCount
    };

    function getColDef(key, val) {
        const type = typeof val,
            typeMap = {
                'string': { cellType: 'text', filter: 'agTextColumnFilter' },
                'number': { cellType: 'number', filter: 'agNumberColumnFilter' },
                'boolean': { cellType: 'boolean' },
                'object': { cellType: 'object' },
            };
        let def = {
            field: key,
            headerName: key.charAt(0).toUpperCase() + key.slice(1),
            cellDataType: typeMap[type].cellType,
            filter: typeMap[type].filter || null
        };
        if (type === 'date') {
            def.cellDataType = 'date';
            def.filter = 'agDateColumnFilter';
        } else if (type === 'number' && !['id', 'year'].includes(key)) {
            def.valueFormatter = params => params.data ? params.data[key]?.toFixed(2) : null;
        } else if (type === 'boolean') {
            def.cellRenderer = params => params.data ? (params.data[key] ? 'Y' : 'N') : null;
        } else if (type === 'object') {
            def.cellRenderer = params => JSON.stringify(params.data[key]);
        }
        if (key === 'id') {
            def.hide = true;
        }
        return def;
    }

    function getUuid() {
        const uuid = new Uint32Array(4);
        window.crypto.getRandomValues(uuid);
        return uuid.reduce((acc, val) => acc + val.toString(16).padStart(8, '0'), '');
    }

    const gridApi = agGrid.createGrid(document.querySelector("#myGrid"), gridOptions);
    console.clear();

    const msgQueue = {},
        myWorker = new Worker(`/app/js/worker.js`);
    myWorker.addEventListener('message', function (e) {
        const { uuid, type, payload } = e.data;
        if (type === 'initRow') {
            const defs = Object.keys(payload).map(key => getColDef(key, payload[key]));
            gridApi.setGridOption('columnDefs', defs);
            gridApi.setGridOption('loading', false);
        } else if (type === 'resRows') {
            const { params } = msgQueue[uuid] ?? {};
            delete msgQueue[uuid];
            const { rows } = payload;
            params?.success({ rowData: rows });
        }
    });
    gridApi.setGridOption('serverSideDatasource', {
        getRows: (params) => {
            const uuid = getUuid();
            msgQueue[uuid] = { params };
            myWorker.postMessage({ uuid, type: 'getRows', payload: params.request });
        }
    });

})()