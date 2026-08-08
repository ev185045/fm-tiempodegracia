// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuración de Firebase (usa la misma que en app.js)
firebase.initializeApp({
    apiKey: "AIzaSyCVL125LnbT492XCVjKaL4fZ7dQ-G2BsWI",
    authDomain: "tiempo-de-gracia-app.firebaseapp.com",
    projectId: "tiempo-de-gracia-app",
    storageBucket: "tiempo-de-gracia-app.firebasestorage.app",
    messagingSenderId: "888611440788",
    appId: "1:888611440788:web:e78a97ffe7d64e44c81",
    measurementId: "G-3P34N97Z44"
});

const messaging = firebase.messaging();

// Manejar mensajes en segundo plano (cuando la app no está abierta)
messaging.onBackgroundMessage((payload) => {
    console.log('📩 Mensaje en segundo plano:', payload);
    const notificationTitle = payload.notification.title || 'Tiempo de Gracia';
    const notificationOptions = {
        body: payload.notification.body || '¡Escucha la radio en vivo!',
        icon: '/logo.png',
        badge: '/logo.png',
        vibrate: [200, 100, 200],
        data: payload.data || {}
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});