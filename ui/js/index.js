(async () => {

    const gridOptions = {
        theme: agGrid.themeBalham,
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
                { statusPanel: "agTotalAndFilteredRowCountComponent" },
                { statusPanel: "agTotalRowCountComponent" },
                { statusPanel: "agFilteredRowCountComponent" },
                { statusPanel: "agSelectedRowCountComponent" },
                { statusPanel: "agAggregationComponent" },
            ],
        },
        rowSelection: 'multiple',
        getRowId: (params) => String(params.data.id),
    };

    const gridApi = agGrid.createGrid(document.querySelector("#myGrid"), gridOptions);
    console.clear();

    const myWorker = new Worker(`/app/js/worker.js`);
    myWorker.onmessage = function (e) {
        const { data } = e;
        const { type, payload } = data;

        if (type === 'fullData') {
            console.log('Data received from worker:', type);

            gridApi.setGridOption('loading', true);
            const columnDefs = Object.keys(payload[0])
                .map(key => getColDef(key, payload[0][key]));
            gridApi.setGridOption('columnDefs', columnDefs);
            gridApi.setGridOption('rowData', payload);
            gridApi.setGridOption('loading', false);
        } else if (type === 'transaction') {
            gridApi.applyTransactionAsync(payload, () => {
                //gridApi.flushAsyncTransactions();
            });
            // gridApi.refreshCells({ force: true });
        }
    }

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
        return def;
    }

})()