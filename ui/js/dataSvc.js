const getDataSvc = (options) => () => {
    const { targetSize, onInitLoad, onNextLoad, onRealtime } = options;

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
            onRealtime(rows);
        };
    }

    return {
        init: async () => {
            const data = await fetch('/api/rows?_page=1&_size=1').then(r => r.json());
            return Array.isArray(data) && data.length ? data[0] : null;
        },
        load: async () => {
            const data = await fetch('/api/rows').then(r => r.json());
            onInitLoad(data);

            const startId = data[0].id;
            let count = data.length;
            while (count < targetSize) {
                await fetch('/api/_refresh')
                const rows = await fetch('/api/rows').then(r => r.json());
                rows.forEach((row, index) => row.id = startId + count + index);
                count += rows.length;

                onNextLoad(rows);
            }
        },
        listen: startWebSocket
    }

}
