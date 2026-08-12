import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onChildAdded, remove, query, orderByChild, limitToLast, get, onValue, set, update, onDisconnect } from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// ===== ESPERAR A QUE EL DOM ESTÉ LISTO =====
document.addEventListener('DOMContentLoaded', function () {

    // -------------------- CONFIGURACIÓN DE FIREBASE --------------------
    const firebaseConfig = {
        apiKey: "AIzaSyCVL125LnbT492XCVjKaL4fZ7dQ-G2BsWI",
        authDomain: "tiempo-de-gracia-app.firebaseapp.com",
        databaseURL: "https://tiempo-de-gracia-app-default-rtdb.firebaseio.com",
        projectId: "tiempo-de-gracia-app",
        storageBucket: "tiempo-de-gracia-app.firebasestorage.app",
        messagingSenderId: "888611440788",
        appId: "1:888611440788:web:e78a97ffe7d64e44c81",
        measurementId: "G-3P34N97Z44"
    };

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const mensajesRef = ref(db, 'mensajes');

    // -------------------- ELEMENTOS DEL DOM --------------------
    const playBtn = document.getElementById('play-btn');
    const estadoTexto = document.getElementById('estado-texto');
    const cancionActual = document.getElementById('cancion-actual');
    const mensajesDiv = document.getElementById('mensajes');
    const nombreInput = document.getElementById('nombre-usuario');
    const mensajeInput = document.getElementById('mensaje-input');
    const enviarBtn = document.getElementById('enviar-btn');
    const contadorConectados = document.getElementById('contador-conectados');

    // Verificar elementos críticos
    console.log('🔍 Elementos del DOM:', { playBtn, estadoTexto, mensajesDiv, nombreInput, mensajeInput, enviarBtn });

        // -------------------- REPRODUCTOR DE RADIO --------------------
    const STREAM_URL = 'http://streaming6.locucionar.com:24340/stream';
    let audio = null;
    let isPlaying = false;
    let pausaManual = false;        // Bandera para saber si la pausa fue manual (usuario)
    let bufferTimeout = null;       // Timeout para detectar buffering largo

    // Función para crear una nueva instancia de Audio (reinicia el stream)
    function crearAudio() {
        if (audio) {
            audio.pause();
            audio.src = '';
            audio = null;
        }
        audio = new Audio(STREAM_URL);
        audio.preload = 'auto';      // Precarga para mejor rendimiento
        return audio;
    }

    // Función para reiniciar el stream (forzar recarga)
    function reiniciarStream() {
        console.log('🔄 Reiniciando stream para tiempo real...');
        const estabaSonando = isPlaying;
        if (audio) {
            audio.pause();
            audio.src = '';
        }
        crearAudio();
        // Si estaba sonando, intentamos reproducir de nuevo
        if (estabaSonando) {
            audio.play().catch(err => console.warn('⚠️ Error al reanudar tras reinicio:', err));
        }
    }

    // Inicializar audio
    if (playBtn && estadoTexto) {
        crearAudio();

        // ---- Eventos de reproducción ----
        audio.addEventListener('loadstart', () => {
            estadoTexto.textContent = 'Conectando...';
        });

        audio.addEventListener('canplay', () => {
            estadoTexto.textContent = 'Listo';
        });

        audio.addEventListener('playing', () => {
            estadoTexto.textContent = 'En vivo';
            playBtn.textContent = '⏸';
            isPlaying = true;
            pausaManual = false;   // Si se reanuda exitosamente, limpiar bandera
            if (bufferTimeout) {
                clearTimeout(bufferTimeout);
                bufferTimeout = null;
            }
        });

        audio.addEventListener('pause', () => {
            // Solo actualizamos estado si no fue por error o reinicio
            if (audio && !audio.error) {
                estadoTexto.textContent = 'Pausado';
                playBtn.textContent = '▶';
                isPlaying = false;
            }
        });

        // ---- Eventos de error / interrupción ----
        audio.addEventListener('error', (e) => {
            console.warn('⚠️ Error en el reproductor:', e);
            estadoTexto.textContent = 'Error de conexión';
            playBtn.textContent = '▶';
            isPlaying = false;
            pausaManual = false;   // El error no es manual
            // Reintentar automáticamente tras 2 segundos
            setTimeout(() => {
                if (!isPlaying && !pausaManual) {
                    console.log('🔄 Reintentando conexión...');
                    reiniciarStream();
                    if (playBtn) playBtn.textContent = '⏸';
                    audio.play().catch(() => {});
                }
            }, 2000);
        });

        // Evento 'stalled' (se detuvo por falta de datos)
        audio.addEventListener('stalled', () => {
            console.warn('⚠️ Reproductor detenido (stalled)');
            if (!pausaManual && isPlaying) {
                estadoTexto.textContent = 'Reconectando...';
                // Si se queda stalled por más de 5 segundos, reiniciamos
                if (bufferTimeout) clearTimeout(bufferTimeout);
                bufferTimeout = setTimeout(() => {
                    console.log('🔄 Reiniciando por stalled prolongado');
                    reiniciarStream();
                    if (playBtn) playBtn.textContent = '⏸';
                    audio.play().catch(() => {});
                }, 5000);
            }
        });

        // Evento 'waiting' (buffering)
        audio.addEventListener('waiting', () => {
            if (!pausaManual && isPlaying) {
                estadoTexto.textContent = 'Cargando...';
                if (bufferTimeout) clearTimeout(bufferTimeout);
                bufferTimeout = setTimeout(() => {
                    console.log('🔄 Reiniciando por buffering largo');
                    reiniciarStream();
                    if (playBtn) playBtn.textContent = '⏸';
                    audio.play().catch(() => {});
                }, 10000);
            }
        });

        // Evento 'abort' (cuando se interrumpe la carga)
        audio.addEventListener('abort', () => {
            console.warn('⚠️ Carga abortada');
            if (!pausaManual) {
                // Si no fue manual, reiniciamos
                setTimeout(() => {
                    if (!isPlaying && !pausaManual) {
                        reiniciarStream();
                    }
                }, 1000);
            }
        });

        // ---- Control manual ----
        playBtn.addEventListener('click', () => {
            if (isPlaying) {
                // Pausa manual
                pausaManual = true;
                audio.pause();
                estadoTexto.textContent = 'Pausado';
                playBtn.textContent = '▶';
                isPlaying = false;
                if (bufferTimeout) {
                    clearTimeout(bufferTimeout);
                    bufferTimeout = null;
                }
            } else {
                // Reanudar: si la pausa fue automática (pausaManual false) o hubo error, reiniciamos stream
                if (!pausaManual && audio && audio.error) {
                    console.log('🔄 Reanudando con reinicio de stream (error previo)');
                    reiniciarStream();
                } else if (!pausaManual && audio && (audio.currentTime > 0 || audio.readyState < 2)) {
                    // Si estaba pausado automáticamente y no está listo, reiniciamos
                    console.log('🔄 Reanudando con reinicio de stream (no listo)');
                    reiniciarStream();
                }
                // Si la pausa fue manual, simplemente reanudamos
                if (audio) {
                    audio.play().catch(() => {
                        // Si falla al reproducir, reiniciamos
                        reiniciarStream();
                        audio.play().catch(() => {});
                    });
                } else {
                    crearAudio();
                    audio.play().catch(() => {});
                }
                // Reseteamos bandera de pausa manual al intentar reproducir
                pausaManual = false;
                estadoTexto.textContent = 'Conectando...';
                playBtn.textContent = '⏸';
                isPlaying = true;
            }
        });

        // ---- Detección de cambios de red ----
        window.addEventListener('online', () => {
            console.log('📶 Conexión restablecida');
            if (!isPlaying && !pausaManual) {
                // Si estaba pausado automáticamente, reiniciamos
                reiniciarStream();
                audio.play().catch(() => {});
                playBtn.textContent = '⏸';
                isPlaying = true;
                estadoTexto.textContent = 'Reconectando...';
            }
        });

        window.addEventListener('offline', () => {
            console.log('📶 Conexión perdida');
            estadoTexto.textContent = 'Sin conexión';
            // No detenemos el audio, pero marcamos que no es pausa manual
            pausaManual = false;
        });

    } else {
        console.warn('⚠️ Reproductor no configurado: faltan elementos.');
    }

    // -------------------- CHAT EN VIVO (FIREBASE) --------------------
    if (mensajesDiv && nombreInput && mensajeInput && enviarBtn) {
               // ===== CONTADOR DE OYENTES EN VIVO =====
        const presenciaRef = ref(db, 'presencia');
        const usuariosRef = ref(db, 'presencia/usuarios');

        // Función para actualizar el contador
        function actualizarContadorEnVivo() {
            onValue(usuariosRef, (snapshot) => {
                const data = snapshot.val();
                let count = 0;
                if (data) {
                    const ahora = Date.now();
                    const limite = ahora - 60000; // 1 minuto
                    for (const key in data) {
                        if (data[key] && data[key].timestamp > limite) {
                            count++;
                        }
                    }
                }
                if (contadorConectados) {
                    contadorConectados.textContent = count;
                }
            }, (error) => {
                console.error('❌ Error al leer presencia:', error);
            });
        }

        // Función para registrar presencia
        function registrarPresencia() {
            // Generar un ID único para esta sesión (usando push para que sea único)
            const userId = push(usuariosRef).key;
            if (!userId) {
                console.error('❌ No se pudo generar userId');
                return;
            }
            const userRef = ref(db, `presencia/usuarios/${userId}`);

            // Función para actualizar timestamp
            function actualizarTimestamp() {
                set(userRef, {
                    timestamp: Date.now(),
                    userAgent: navigator.userAgent.substring(0, 50) // acortamos para ahorrar
                }).catch(err => console.error('❌ Error al actualizar presencia:', err));
            }

            // Registrar al conectarse
            actualizarTimestamp();

            // Cuando el usuario se desconecta, eliminar el nodo
            onDisconnect(userRef).remove().catch(err => console.error('❌ Error al configurar onDisconnect:', err));

            // Actualizar cada 30 segundos para mantener la sesión activa
            const interval = setInterval(() => {
                actualizarTimestamp();
            }, 30000);

            // Limpiar al cerrar la página
            window.addEventListener('beforeunload', () => {
                clearInterval(interval);
                // Opcional: eliminar inmediatamente al cerrar
                remove(userRef).catch(() => {});
            });
        }

        // Ejecutar solo si existe el contador
        if (contadorConectados) {
            registrarPresencia();
            actualizarContadorEnVivo();
        }
        const mensajesQuery = query(mensajesRef, orderByChild('timestamp'), limitToLast(50));

        onChildAdded(mensajesQuery, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                agregarMensaje(data.nombre, data.texto, data.timestamp);
            }
        });

        function agregarMensaje(nombre, texto, timestamp) {
            const div = document.createElement('div');
            div.className = 'mensaje';

            const nombreSpan = document.createElement('span');
            nombreSpan.className = 'nombre';
            nombreSpan.textContent = nombre || 'Anónimo';

            const textoSpan = document.createElement('span');
            textoSpan.className = 'texto';
            textoSpan.textContent = texto;

            const horaSpan = document.createElement('span');
            horaSpan.className = 'hora';
            const fecha = new Date(timestamp);
            horaSpan.textContent = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

            div.appendChild(nombreSpan);
            div.appendChild(textoSpan);
            div.appendChild(horaSpan);
            mensajesDiv.appendChild(div);
            mensajesDiv.scrollTop = mensajesDiv.scrollHeight;
        }

        function enviarMensaje() {
            const nombre = nombreInput.value.trim() || 'Anónimo';
            const texto = mensajeInput.value.trim();
            if (!texto) return;

            push(mensajesRef, {
                nombre: nombre,
                texto: texto,
                timestamp: Date.now()
            });

            mensajeInput.value = '';
            mensajeInput.focus();
        }

        enviarBtn.addEventListener('click', enviarMensaje);
        mensajeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') enviarMensaje();
        });

        // Recuperar nombre guardado
        const nombreGuardado = localStorage.getItem('nombreUsuario');
        if (nombreGuardado) nombreInput.value = nombreGuardado;
        nombreInput.addEventListener('change', () => {
            localStorage.setItem('nombreUsuario', nombreInput.value.trim());
        });

        // Contador de conectados (simulado)
        //function actualizarContador() {
          //  contadorConectados.textContent = '0';
        //}
        //actualizarContador();

        // -------------------- LIMPIEZA AUTOMÁTICA DE MENSAJES (CADA 12h) --------------------
        async function limpiarMensajesViejos() {
            const ahora = Date.now();
            const limite = ahora - 12 * 3600 * 1000; // 12 horas

            try {
                // ✅ Usamos get() en lugar de once()
                const snapshot = await get(mensajesRef);
                const data = snapshot.val();
                if (!data) {
                    console.log('ℹ️ No hay mensajes para limpiar.');
                    return;
                }

                const promesas = [];
                let eliminados = 0;

                for (const [key, msg] of Object.entries(data)) {
                    if (!msg.timestamp) {
                        console.warn(`⚠️ Mensaje sin timestamp: ${key}, eliminando...`);
                        const msgRef = ref(db, `mensajes/${key}`);
                        promesas.push(remove(msgRef));
                        eliminados++;
                        continue;
                    }

                    if (msg.timestamp < limite) {
                        const msgRef = ref(db, `mensajes/${key}`);
                        promesas.push(remove(msgRef));
                        eliminados++;
                    }
                }

                if (promesas.length > 0) {
                    await Promise.all(promesas);
                    console.log(`🧹 Limpieza completada: ${eliminados} mensajes antiguos eliminados.`);
                } else {
                    console.log('✅ No hay mensajes antiguos que eliminar.');
                }
            } catch (error) {
                console.error('❌ Error en limpieza de mensajes:', error);
            }
        }

        // Ejecutar limpieza al cargar la página
        limpiarMensajesViejos();

        // Programar limpieza cada 12 horas (43200000 ms)
        setInterval(limpiarMensajesViejos, 12 * 3600 * 1000);

/*
        // ==================== CARRUSEL DE IMÁGENES ====================
        console.log('🚀 Iniciando carrusel...');

        const track = document.getElementById('carouselTrack');
        const nextBtn = document.getElementById('nextBtn');
        const prevBtn = document.getElementById('prevBtn');
        const indicators = document.getElementById('indicators');

        if (!track || !nextBtn || !prevBtn || !indicators) {
            console.error('❌ Faltan elementos del carrusel. Verifica los IDs en el HTML.');
        } else {
            const slides = track.children;
            const total = slides.length;
            if (total === 0) {
                console.warn('⚠️ No hay slides en el carrusel.');
            } else {
                let currentIndex = 0;
                let interval = null;

                // Crear puntos indicadores
                for (let i = 0; i < total; i++) {
                    const dot = document.createElement('span');
                    dot.className = 'dot' + (i === 0 ? ' active' : '');
                    dot.dataset.index = i;
                    indicators.appendChild(dot);
                }

                function moveTo(index) {
                    if (index < 0) index = total - 1;
                    if (index >= total) index = 0;
                    currentIndex = index;
                    track.style.transform = 'translateX(' + (-index * 100) + '%)';
                    // Actualizar puntos
                    const dots = indicators.children;
                    for (let i = 0; i < dots.length; i++) {
                        dots[i].className = 'dot' + (i === index ? ' active' : '');
                    }
                    console.log('🖼️ Carrusel movido a índice', index);
                }

                // Eventos de navegación
                nextBtn.onclick = function () { moveTo(currentIndex + 1); };
                prevBtn.onclick = function () { moveTo(currentIndex - 1); };
                indicators.addEventListener('click', function (e) {
                    const dot = e.target.closest('.dot');
                    if (dot) {
                        const idx = parseInt(dot.dataset.index);
                        moveTo(idx);
                    }
                });

                // Auto-slide
                function iniciarAutoSlide() {
                    if (interval) clearInterval(interval);
                    interval = setInterval(function () {
                        moveTo(currentIndex + 1);
                    }, 5000);
                    console.log('▶️ Auto-slide iniciado (cada 5s)');
                }

                // Pausar al interactuar
                track.addEventListener('mouseenter', function () { if (interval) clearInterval(interval); });
                track.addEventListener('mouseleave', function () { iniciarAutoSlide(); });
                track.addEventListener('touchstart', function () { if (interval) clearInterval(interval); });
                track.addEventListener('touchend', function () { iniciarAutoSlide(); });

                // Iniciar auto-slide
                iniciarAutoSlide();

                console.log('✅ Carrusel configurado correctamente. Total slides:', total);
            }
        }
 */

                // ===== SECCIÓN DE EVENTOS PRÓXIMOS =====
        const eventosContainer = document.getElementById('eventos-container');
        const eventosRef = ref(db, 'eventos');

        if (eventosContainer) {
            // Función para renderizar los eventos
            function renderizarEventos(snapshot) {
                const data = snapshot.val();
                eventosContainer.innerHTML = ''; // Limpiar contenedor

                if (!data) {
                    eventosContainer.innerHTML = '<p class="sin-eventos">📭 No hay eventos próximos por ahora.</p>';
                    return;
                }

                // Convertir objeto en array y filtrar activos
                const eventosArray = Object.values(data)
                    .filter(evento => evento.activo !== false) // si no tiene activo o es true, se muestra
                    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')); // ordenar por fecha

                if (eventosArray.length === 0) {
                    eventosContainer.innerHTML = '<p class="sin-eventos">📭 No hay eventos próximos por ahora.</p>';
                    return;
                }

                // Crear grid de tarjetas
                const grid = document.createElement('div');
                grid.className = 'eventos-grid';

                eventosArray.forEach(evento => {
                    const tarjeta = document.createElement('div');
                    tarjeta.className = 'tarjeta-evento';

                                        // Imagen (si existe)
                    if (evento.imagenUrl) {
                        const img = document.createElement('img');
                        img.src = evento.imagenUrl;
                        img.alt = evento.titulo || 'Evento';
                        img.loading = 'lazy';
                        img.style.cursor = 'pointer';
                        img.addEventListener('click', function(e) {
                            e.stopPropagation(); // Evita que se propague
                            abrirLightbox(evento.imagenUrl);
                        });
                        tarjeta.appendChild(img);
                    }

                    // Información
                    const info = document.createElement('div');
                    info.className = 'info';

                    const titulo = document.createElement('h3');
                    titulo.textContent = evento.titulo || 'Evento';

                    const fecha = document.createElement('div');
                    fecha.className = 'fecha';
                    fecha.textContent = evento.fecha ? `📅 ${evento.fecha}` : '';

                    const descripcion = document.createElement('p');
                    descripcion.className = 'descripcion';
                    descripcion.textContent = evento.descripcion || '';

                    info.appendChild(titulo);
                    if (fecha.textContent) info.appendChild(fecha);
                    if (descripcion.textContent) info.appendChild(descripcion);

                    tarjeta.appendChild(info);
                    grid.appendChild(tarjeta);
                });

                eventosContainer.appendChild(grid);
            }

            // Escuchar cambios en tiempo real
            onValue(eventosRef, renderizarEventos, (error) => {
                console.error('❌ Error al cargar eventos:', error);
                eventosContainer.innerHTML = '<p class="sin-eventos">⚠️ Error al cargar los eventos. Intenta más tarde.</p>';
            });
        }

                // ===== LIGHTBOX PARA IMÁGENES DE EVENTOS =====
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');

        function abrirLightbox(url) {
            if (!lightbox || !lightboxImg) return;
            lightboxImg.src = url;
            lightbox.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // Evita scroll detrás
        }

        function cerrarLightbox() {
            if (!lightbox) return;
            lightbox.style.display = 'none';
            document.body.style.overflow = ''; // Restaura scroll
        }

        // Cerrar al hacer clic fuera de la imagen
        if (lightbox) {
            lightbox.addEventListener('click', function(e) {
                if (e.target === lightbox) {
                    cerrarLightbox();
                }
            });

            // Cerrar con tecla ESC
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    cerrarLightbox();
                }
            });
        }
                                // ===== BOTÓN DE DESCARGA APK =====
        const installBtn = document.getElementById('installBtn');
        const DOWNLOAD_URL = installBtn?.dataset.downloadUrl || '/app.apk';
        const HIDE_TIMEOUT = 5 * 60 * 1000; // 5 minutos

        // Función para configurar el botón en modo descarga (verde)
        function setDownloadMode() {
            if (!installBtn) return;
            installBtn.textContent = '📥 Descargar APK';
            installBtn.style.background = '#25D366'; // Verde
            installBtn.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.3)';
            installBtn.onclick = function(e) {
                e.preventDefault();
                window.location.href = DOWNLOAD_URL;
                console.log('📥 Descarga del APK iniciada');
            };
        }

        // Programar ocultación del botón después de 5 minutos
        let hideTimeout;

        function scheduleHide() {
            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (installBtn) {
                    installBtn.style.display = 'none';
                    console.log('⏰ Botón oculto después de 5 minutos de inactividad');
                }
            }, HIDE_TIMEOUT);
        }

        // Función para resetear el temporizador al interactuar
        function resetHideTimer() {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
            if (installBtn && installBtn.style.display === 'none') {
                installBtn.style.display = 'inline-block';
                setDownloadMode(); // Asegurar que el botón esté en modo descarga
            }
            scheduleHide();
        }

        // Verificar si el usuario ya descargó o instaló (opcional)
        const alreadyDownloaded = localStorage.getItem('appInstalled') === 'true';
        if (alreadyDownloaded) {
            if (installBtn) installBtn.style.display = 'none';
        } else {
            // Mostrar el botón en modo descarga
            setDownloadMode();
            scheduleHide();

            // Reiniciar temporizador al pasar el mouse o hacer clic
            if (installBtn) {
                installBtn.addEventListener('mouseenter', resetHideTimer);
                installBtn.addEventListener('click', resetHideTimer);
            }
        }

                // ===== ACORDEONES DE HORARIOS =====
        const acordeones = document.querySelectorAll('.acordeon');

        acordeones.forEach((acordeon) => {
            const toggle = acordeon.querySelector('.acordeon-header');
            const content = acordeon.querySelector('.acordeon-content');
            const icon = acordeon.querySelector('.acordeon-icon');
            
            if (toggle && content) {
                toggle.addEventListener('click', function () {
                    // Cerrar otros acordeones (comportamiento de acordeón)
                    acordeones.forEach((other) => {
                        if (other !== acordeon && other.classList.contains('open')) {
                            other.classList.remove('open');
                            const otherIcon = other.querySelector('.acordeon-icon');
                            if (otherIcon) otherIcon.textContent = '▼';
                        }
                    });
                    
                    // Alternar el actual
                    acordeon.classList.toggle('open');
                    if (acordeon.classList.contains('open')) {
                        icon.textContent = '▲';
                    } else {
                        icon.textContent = '▼';
                    }
                });
            }
        });        

        // ===== COMPARTIR APP =====
        const shareBtn = document.getElementById('shareBtn');
        const APP_URL = 'https://fm-tiempodegracia.pages.dev/'; // ← Cambia si tu URL cambia

        if (shareBtn) {
            shareBtn.addEventListener('click', function() {
                // Verificar si el navegador soporta la API Web Share
                if (navigator.share) {
                    navigator.share({
                        title: 'Tiempo de Gracia - Radio Online',
                        text: '¡Escucha la radio Tiempo de Gracia en vivo! 🙌',
                        url: APP_URL
                    }).then(() => {
                        console.log('✅ Compartido exitosamente');
                    }).catch((error) => {
                        if (error.name !== 'AbortError') {
                            console.error('❌ Error al compartir:', error);
                            // Fallback: copiar enlace
                            copiarEnlace();
                        }
                    });
                } else {
                    // Fallback para navegadores sin Web Share API
                    copiarEnlace();
                }
            });
        }

        // Función de fallback: copiar enlace al portapapeles
        function copiarEnlace() {
            const input = document.createElement('input');
            input.value = APP_URL;
            document.body.appendChild(input);
            input.select();
            try {
                document.execCommand('copy');
                alert('¡Enlace copiado! Compartelo en tus redes o chats');
            } catch (err) {
                alert('No se pudo copiar el enlace. Puedes copiarlo manualmente: ' + APP_URL);
            }
            document.body.removeChild(input);
        }
                // ===== NOTIFICACIONES PUSH (VERSIÓN MODULAR) =====
        const messaging = getMessaging(app); // 'app' ya está inicializado

        // Función para solicitar permiso y obtener token
        async function requestNotificationPermission() {
            if (!('Notification' in window)) {
                console.warn('⚠️ Este navegador no soporta notificaciones.');
                return;
            }

            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    console.log('✅ Permiso de notificaciones concedido');
                    await getAndShowToken();
                } else {
                    console.warn('⚠️ Permiso de notificaciones denegado');
                }
            } catch (error) {
                console.error('❌ Error al solicitar permiso:', error);
            }
        }

        // Función para obtener y mostrar el token
        async function getAndShowToken() {
    try {
        const token = await getToken(messaging, {
            vapidKey: 'BADOuQKABK7KexWOJSF9mapK75GVI6rJ8Y3ecNuSeExe6ubNQKLjKnLkjnn8lTlQhTvqXOAIjrHe7sJuWa39kP0'
        });
        console.log('✅ Token FCM:', token);
        localStorage.setItem('fcmToken', token);

        // 🔥 GUARDAR EL TOKEN EN FIREBASE DATABASE
        if (token) {
            const tokenRef = ref(db, 'tokens/' + token);
            await set(tokenRef, {
                token: token,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                // Opcional: guardar también el nombre de usuario si está disponible
                // nombre: nombreInput ? nombreInput.value : 'Anónimo'
            });
            console.log('✅ Token guardado en Firebase Database');
        }

        return token;
    } catch (error) {
        console.error('❌ Error al obtener token FCM:', error);
        if (error.code === 'messaging/unsupported-browser') {
            console.warn('⚠️ Tu navegador no soporta notificaciones push.');
        }
    }
}

        // Manejar mensajes en primer plano (cuando la app está abierta)
        onMessage(messaging, (payload) => {
            console.log('📩 Mensaje en primer plano:', payload);
            // Puedes mostrar un toast o notificación personalizada aquí
            alert(`📢 ${payload.notification.title}\n${payload.notification.body}`);
        });

        // Asignar la solicitud de permiso a los botones
        
        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                if (Notification.permission === 'granted') {
                    getAndShowToken();
                } else {
                    requestNotificationPermission();
                }
            });
        }

        
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (Notification.permission === 'granted') {
                    getAndShowToken();
                } else {
                    requestNotificationPermission();
                }
            });
        }

        // Si ya tienes permiso, intenta obtener el token automáticamente
        if (Notification.permission === 'granted') {
            getAndShowToken();
        } else if (Notification.permission === 'default') {
            console.log('ℹ️ Aún no se ha solicitado permiso. Haz clic en "Compartir" o en el reproductor.');
        }
                // ===== MENÚ HAMBURGUESA =====
        const menuToggle = document.getElementById('menuToggle');
        const drawer = document.getElementById('drawer');
        const closeDrawerBtn = document.getElementById('closeDrawer');
        const overlay = document.getElementById('drawerOverlay');
        const menuLinks = document.querySelectorAll('.drawer-menu a');

        // Abrir menú
        menuToggle.addEventListener('click', () => {
            drawer.classList.add('open');
            overlay.classList.add('active');
            menuToggle.classList.add('active');
            document.body.style.overflow = 'hidden'; // Evita scroll
        });

        // Cerrar menú
        function closeDrawer() {
            drawer.classList.remove('open');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
            document.body.style.overflow = '';
        }

        closeDrawerBtn.addEventListener('click', closeDrawer);
        overlay.addEventListener('click', closeDrawer);

        // Cerrar al seleccionar una opción
        menuLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget.id;
                if (target === 'menuSugerencias') {
                    abrirModalSugerencias();
                } else if (target === 'menuColaborar') {
                    abrirModalColaborar();
                }
                closeDrawer();
            });
        });

        // ===== MODAL SUGERENCIAS =====
        function abrirModalSugerencias() {
            const existing = document.querySelector('.modal-overlay');
            if (existing) existing.remove();

            const overlayModal = document.createElement('div');
            overlayModal.className = 'modal-overlay';
            overlayModal.innerHTML = `
                <div class="modal">
                    <div class="modal-header">
                        <h2>📝 Sugerencias y reporte de fallas</h2>
                        <button class="modal-close">✕</button>
                    </div>
                    <form id="formSugerencia">
                        <div class="form-group">
                            <label for="sugerencia-nombre">Tu nombre</label>
                            <input type="text" id="sugerencia-nombre" placeholder="Ej: Juan Pérez" required>
                        </div>
                        <div class="form-group">
                            <label for="sugerencia-email">Correo electrónico</label>
                            <input type="email" id="sugerencia-email" placeholder="ejemplo@correo.com" required>
                        </div>
                        <div class="form-group">
                            <label for="sugerencia-mensaje">Mensaje</label>
                            <textarea id="sugerencia-mensaje" placeholder="Cuéntanos tu sugerencia o el fallo que encontraste..." required></textarea>
                        </div>
                        <button type="submit" class="btn-enviar">Enviar sugerencia</button>
                    </form>
                </div>
            `;

            document.body.appendChild(overlayModal);

            // Cerrar modal
            const closeModal = overlayModal.querySelector('.modal-close');
            closeModal.addEventListener('click', () => overlayModal.remove());

            // Cerrar al hacer clic fuera del modal
            overlayModal.addEventListener('click', (e) => {
                if (e.target === overlayModal) overlayModal.remove();
            });

            // Manejar envío del formulario
            const form = overlayModal.querySelector('#formSugerencia');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nombre = document.getElementById('sugerencia-nombre').value.trim();
                const email = document.getElementById('sugerencia-email').value.trim();
                const mensaje = document.getElementById('sugerencia-mensaje').value.trim();

                if (!nombre || !email || !mensaje) {
                    alert('Por favor, completa todos los campos.');
                    return;
                }

                try {
                    const sugerenciasRef = ref(db, 'sugerencias');
                    await push(sugerenciasRef, {
                        nombre,
                        email,
                        mensaje,
                        timestamp: Date.now()
                    });
                    alert('✅ ¡Gracias! Tu sugerencia ha sido enviada.');
                    overlayModal.remove();
                } catch (error) {
                    console.error('Error al enviar sugerencia:', error);
                    alert('❌ Hubo un error al enviar tu sugerencia. Intenta más tarde.');
                }
            });
        }

        // ===== MODAL COLABORAR =====
        function abrirModalColaborar() {
            const existing = document.querySelector('.modal-overlay');
            if (existing) existing.remove();

            const overlayModal = document.createElement('div');
            overlayModal.className = 'modal-overlay';
            overlayModal.innerHTML = `
                <div class="modal">
                    <div class="modal-header">
                        <h2>❤️ Quiero colaborar con la radio</h2>
                        <button class="modal-close">✕</button>
                    </div>
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        Puedes apoyar el mantenimiento de nuestra aplicacion con una ofrenda voluntaria. ¡Dios te bendiga!
                    </p>
                    <div class="cbu-info">
                        <p><strong>Alias:</strong> <span id="aliasInfo">Fmtiempodegracia</span></p>
                        <p><strong>CBU:</strong> <span id="cbuInfo">0000076500000054435304</span></p>
                    </div>
                    <button class="btn-copiar" id="copiarAlias">📋 Copiar Alias</button>
                    <button class="btn-copiar" id="copiarCBU" style="margin-left: 8px;">📋 Copiar CBU</button>
                </div>
            `;

            document.body.appendChild(overlayModal);

            // Cerrar modal
            const closeModal = overlayModal.querySelector('.modal-close');
            closeModal.addEventListener('click', () => overlayModal.remove());
            overlayModal.addEventListener('click', (e) => {
                if (e.target === overlayModal) overlayModal.remove();
            });

            // Copiar Alias
            const copiarAlias = overlayModal.querySelector('#copiarAlias');
            copiarAlias.addEventListener('click', () => {
                const alias = document.getElementById('aliasInfo').textContent;
                navigator.clipboard.writeText(alias).then(() => {
                    alert('✅ Alias copiado al portapapeles');
                }).catch(() => {
                    // Fallback
                    const input = document.createElement('input');
                    input.value = alias;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                    alert('✅ Alias copiado al portapapeles');
                });
            });

            // Copiar CBU
            const copiarCBU = overlayModal.querySelector('#copiarCBU');
            copiarCBU.addEventListener('click', () => {
                const cbu = document.getElementById('cbuInfo').textContent;
                navigator.clipboard.writeText(cbu).then(() => {
                    alert('✅ CBU copiado al portapapeles');
                }).catch(() => {
                    const input = document.createElement('input');
                    input.value = cbu;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                    alert('✅ CBU copiado al portapapeles');
                });
            });
        }
        }
        console.log('🏁 Inicialización completa.');
    }); // FIN DE DOMContentLoaded
