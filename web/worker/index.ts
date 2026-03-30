// Custom Handler for Background Notifications and Bubbles
// This listener waits for the main thread (socket.ts) to send a message when hidden
self.addEventListener('message', (event: any) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const payload = event.data.payload;
        const options: any = {
            body: payload.body,
            icon: payload.icon || '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            vibrate: [200, 100, 200, 100, 200],
            tag: payload.tag || 'general',
            renotify: true,
            requireInteraction: true,
            timestamp: Date.now(),
            data: payload.data || { url: '/' },
            // Bubble Metadata: Android TWA looks for shortcuts linked to a conversation
            actions: [
                { action: 'open', title: 'Open Chat' }
            ]
        };

        // Show the notification via the Service Worker (System-Level)
        (self as any).registration.showNotification(payload.title, options);
    }
});

// Handle clicking on the notification or bubble
self.addEventListener('notificationclick', (event: any) => {
    event.notification.close();
    event.waitUntil(
        (self as any).clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList: any[]) => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return (self as any).clients.openWindow(event.notification.data.url || '/');
        })
    );
});

export {}; 
