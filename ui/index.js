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

    const getColDef = (key, val) => {
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

    const dataCache = []

    fetch('/api/rows')
        .then(response => response.json())
        .then(data => {
            console.clear();
            dataCache.splice(0, dataCache.length, ...data);

            const columnDefs = Object.keys(data[0])
                .map(key => getColDef(key, data[0][key]));
            gridApi.setGridOption('columnDefs', columnDefs);
            gridApi.setGridOption('rowData', data);
            gridApi.setGridOption('loading', false);
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });

    function startWebSocket(isReconnect) {
        console.log(`${isReconnect ? 'Reconnecting' : 'Connecting'} to WebSocket...`);
        const ws = new WebSocket(`ws://${location.host}/ws`);
        ws.onopen = () => {
            isReconnect && console.clear();
            console.log('WebSocket is open now.');
            ws.onclose = () => {
                console.log('WebSocket is closed now.')
                setTimeout(() => startWebSocket(true), 3000);
            };
        }
        ws.onerror = (event) => {
            console.error('WebSocket error observed:', event);
            setTimeout(() => startWebSocket(true), 3000);
        };

        ws.onmessage = function (event) {
            const msg = JSON.parse(event.data),
                { rows } = msg;

            const existIds = dataCache.map(x => x.id),
                transaction = {
                    add: rows.filter(x => !existIds.includes(x.id)),
                    update: rows.filter(x => existIds.includes(x.id))
                };
            dataCache.push(...transaction.add);
            gridApi.applyTransactionAsync(transaction, () => {
                //TODO: check if the row is already exist, then update the row
                //gridApi.flushAsyncTransactions();
            });
            // gridApi.refreshCells({ force: true });
        };
    }
    startWebSocket();

})()