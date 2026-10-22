(function () {
    'use strict';

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    ready(function () {
        var post = document.querySelector('.post');

        // Reading progress
        if (post) {
            var progress = document.createElement('div');
            progress.className = 'reading-progress';
            document.body.appendChild(progress);

            var updateProgress = function () {
                var rect = post.getBoundingClientRect();
                var total = post.offsetHeight - window.innerHeight;
                var current = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
                progress.style.width = (total > 0 ? (current / total) * 100 : 0) + '%';
            };

            window.addEventListener('scroll', updateProgress, { passive: true });
            window.addEventListener('resize', updateProgress);
            updateProgress();
        }

        // Lazy-load article images
        var contentImages = document.querySelectorAll('.content img');
        contentImages.forEach(function (img, index) {
            if (index > 0) img.setAttribute('loading', 'lazy');
            img.setAttribute('decoding', 'async');
        });

        // Click to zoom
        if (contentImages.length) {
            var overlay = document.createElement('div');
            overlay.className = 'img-zoom-overlay';
            var zoomed = document.createElement('img');
            overlay.appendChild(zoomed);

            var closeOverlay = function () {
                overlay.classList.remove('active');
                document.body.classList.remove('no-scroll');
            };

            overlay.addEventListener('click', closeOverlay);
            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') closeOverlay();
            });

            document.body.appendChild(overlay);

            contentImages.forEach(function (img) {
                img.addEventListener('click', function () {
                    if (!img.src) return;
                    zoomed.src = img.currentSrc || img.src;
                    zoomed.alt = img.alt || '';
                    overlay.classList.add('active');
                    document.body.classList.add('no-scroll');
                });
            });
        }

        // Wrap tables for horizontal scrolling
        document.querySelectorAll('.content table').forEach(function (table) {
            if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;
            var wrap = document.createElement('div');
            wrap.className = 'table-wrap';
            table.parentNode.insertBefore(wrap, table);
            wrap.appendChild(table);
        });

        // Copy code button
        document.querySelectorAll('.content .highlight').forEach(function (block) {
            var pre = block.querySelector('pre');
            if (!pre) return;

            var button = document.createElement('button');
            button.className = 'copy-code-btn';
            button.type = 'button';
            button.textContent = '复制';

            button.addEventListener('click', function () {
                var text = pre.innerText || '';
                var done = function () {
                    button.textContent = '已复制';
                    setTimeout(function () { button.textContent = '复制'; }, 1500);
                };

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done).catch(function () {});
                } else {
                    var area = document.createElement('textarea');
                    area.value = text;
                    area.style.position = 'fixed';
                    area.style.opacity = '0';
                    document.body.appendChild(area);
                    area.select();
                    try { document.execCommand('copy'); done(); } catch (e) {}
                    document.body.removeChild(area);
                }
            });

            block.appendChild(button);
        });

        // Open external links in a new tab
        document.querySelectorAll('.content a[href^="http"]').forEach(function (link) {
            if (link.hostname && link.hostname !== window.location.hostname) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
        });
    });
})();
