 
function toggleFAQ(element) {
    const faqItem = element.closest('.faq-item');
    const isActive = faqItem.classList.contains('active');
    
     
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
    });
    
     
    if (!isActive) {
        faqItem.classList.add('active');
    }
}

 
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        
         
        if (href !== '#') {
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

 
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Condomit Landing Page Loaded');
    if (window.CondomitDesktop?.isDesktop) {
        const desktopDownload = document.getElementById('desktopDownloadCta') || document.querySelector('a[href*="download-desktop"]');
        if (desktopDownload) {
            desktopDownload.hidden = true;
            desktopDownload.style.setProperty('display', 'none', 'important');
            desktopDownload.setAttribute('aria-hidden', 'true');
        }
    }
    let pendingRedirect = false;
    if (typeof window.resumeCondomitSession === 'function') {
        try {
            const result = await window.resumeCondomitSession({ redirect: true });
            pendingRedirect = Boolean(result?.redirected);
        } catch (error) {
            console.warn('[SESSION] Não foi possível restaurar automaticamente a sessão:', error?.message || error);
        }
    }
    if (!pendingRedirect) {
        clearTimeout(window.__condomitResumeTimeout);
        document.documentElement.classList.remove('condomit-session-check');
    }
});
