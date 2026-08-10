// FAQ Toggle Functionality
function toggleFAQ(element) {
    const faqItem = element.closest('.faq-item');
    const isActive = faqItem.classList.contains('active');
    
    // Close all FAQ items
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Open the clicked item if it wasn't active
    if (!isActive) {
        faqItem.classList.add('active');
    }
}

// Smooth Scroll for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        
        // Only apply smooth scroll if not linking to another page
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Condomit Landing Page Loaded');
    if (typeof window.resumeCondomitSession === 'function') {
        try { await window.resumeCondomitSession({ redirect: true }); } catch (error) {
            console.warn('[SESSION] Não foi possível restaurar automaticamente a sessão:', error?.message || error);
        }
    }
});
