from pathlib import Path
import re
root = Path('/mnt/data/condomit_v056_work')

def read(rel):
    return (root/rel).read_text(encoding='utf-8')

def write(rel, text):
    (root/rel).write_text(text, encoding='utf-8')

# 1) inicio.html remove Recursos and bump CSS version
for rel in ['inicio.html', 'www/inicio.html']:
    p = root/rel
    if not p.exists():
        continue
    txt = p.read_text(encoding='utf-8')
    txt = txt.replace('<a href="#recursos">Recursos</a>\n', '')
    txt = txt.replace('styles/inicio.css?v=054', 'styles/inicio.css?v=056')
    # ensure buttons horizontal/no wrap text; no other text changes needed
    p.write_text(txt, encoding='utf-8')

# 2) inicio.css make header sticky and buttons horizontal
css = read('styles/inicio.css')
add = """

/* 056 - home pública: cabeçalho fixo, sem botão Recursos, controles horizontais. */
body { overflow-x: hidden; }
.header {
    position: sticky;
    top: 0;
    z-index: 1000;
    backdrop-filter: blur(14px);
    background: linear-gradient(90deg, rgba(8,23,61,.82), rgba(37,99,235,.78));
    box-shadow: 0 10px 28px rgba(15,23,42,.14);
}
.header .header-content {
    max-width: 1240px;
    margin: 0 auto;
    padding: 10px 20px;
    gap: 18px;
}
.logo { height: 116px; margin-left: 0; flex-shrink: 0; }
.header-nav { flex-wrap: nowrap; gap: 18px; margin-left: 0; }
.header-nav a, .btn-login, .btn-signup, .landing-language-switcher { white-space: nowrap; }
.header-nav .btn-login, .header-nav .btn-signup {
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    min-height: 54px; padding: 0 18px; line-height: 1; text-align: center;
}
.header-nav .btn-signup { min-width: 132px; }
.header-nav .btn-login { min-width: 112px; }
.landing-language-switcher {
    display: inline-flex; align-items: center; gap: 8px; min-height: 46px;
    padding: 0 14px; border: 1px solid rgba(255,255,255,.28); border-radius: 12px;
    background: rgba(255,255,255,.08); color: #fff;
}
.landing-language-switcher select {
    background: transparent; border: 0; color: inherit; font: inherit; outline: none; padding-right: 18px;
}
.landing-language-switcher select option { color: #0f172a; }
.landing-language-arrow { pointer-events: none; }
.hero-section { min-height: calc(75vh + 72px); }
.hero-content { padding-top: 72px; }
@media (max-width: 1180px) {
    .header-content { flex-wrap: wrap; justify-content: center; }
    .header-nav { flex-wrap: wrap; justify-content: center; }
}
@media (max-width: 760px) {
    .logo { height: 96px; }
    .header-content { gap: 14px; }
    .header-nav { gap: 12px; }
    .header-nav .btn-login, .header-nav .btn-signup { min-height: 48px; }
    .hero-content { padding-top: 52px; }
}
"""
if '056 - home pública' not in css:
    css += add
write('styles/inicio.css', css)

# 3) remove condo name main pill in index-morador, bump versions
html = read('pages/index-morador.html')
html = html.replace('../styles/index-morador.css?v=054', '../styles/index-morador.css?v=055')
html = html.replace('../styles/sidebar-account-navigation.css?v=054', '../styles/sidebar-account-navigation.css?v=056')
html = html.replace('../scripts/sidebar-links.js?v=054', '../scripts/sidebar-links.js?v=056')
html = html.replace('../scripts/index-morador.js?v=054', '../scripts/index-morador.js?v=055')
html = re.sub(r'\s*<span class="resident-property">.*?</span>\s*', '\n', html, flags=re.S)
write('pages/index-morador.html', html)

# 4) bump sidebar asset versions across all htmls to 056
for p in list((root/'pages').glob('*.html')) + [root/'pages/index.html', root/'inicio.html', root/'www/index.html', root/'www/inicio.html']:
    if not p.exists():
        continue
    txt = p.read_text(encoding='utf-8')
    txt = txt.replace('sidebar-account-navigation.css?v=054', 'sidebar-account-navigation.css?v=056')
    txt = txt.replace('sidebar-links.js?v=054', 'sidebar-links.js?v=056')
    p.write_text(txt, encoding='utf-8')

# 5) update marketplace page/link versions and cleaner layout
html = read('pages/marketplace.html')
html = html.replace('../styles/marketplace.css?v=035', '../styles/marketplace.css?v=056')
html = html.replace('../styles/sidebar-account-navigation.css?v=056', '../styles/sidebar-account-navigation.css?v=056')
html = html.replace('../scripts/marketplace.js?v=035', '../scripts/marketplace.js?v=056')
html = html.replace('<section class="marketplace-page">\n                <div class="marketplace-head">', '<section class="marketplace-page">\n                <div class="marketplace-head">')
html = html.replace('<h2>MarketPlace do condomínio</h2>', '<h2>Marketplace do condomínio</h2>')
html = html.replace('<p>Encontre boas oportunidades sem sair da sua comunidade.</p>', '<p>Compre, venda ou doe itens com segurança dentro da sua comunidade.</p>')
write('pages/marketplace.html', html)

# 6) update lost-found page/link versions
html = read('pages/achados-perdidos.html')
html = html.replace('../styles/achados-perdidos.css?v=0711', '../styles/achados-perdidos.css?v=056')
html = html.replace('../scripts/achados-perdidos.js?v=0711', '../scripts/achados-perdidos.js?v=056')
# add heading text block
html = html.replace('<section class="lost-found-page">\n                <div class="lost-found-page-actions">', '<section class="lost-found-page">\n                <div class="lost-found-page-header">\n                    <div>\n                        <h2>Achados e perdidos</h2>\n                        <p>Registre, acompanhe e localize itens perdidos ou encontrados no condomínio.</p>\n                    </div>\n                    <div class="lost-found-page-actions">')
html = html.replace('</button>\n                </div>\n                <div class="lost-found-layout">', '</button>\n                    </div>\n                </div>\n                <div class="lost-found-layout">')
write('pages/achados-perdidos.html', html)

# 7) update tipo-usuario styles version
html = read('pages/tipo-usuario.html')
html = html.replace('../styles/tipo-usuario.css?v=055', '../styles/tipo-usuario.css?v=056')
write('pages/tipo-usuario.html', html)

# 8) sidebar-account-navigation.css: reserve space for floating bell and soften sidebar active background utility
css = read('styles/sidebar-account-navigation.css')
add = """

/* 056 - reserva espaço para o sino e evita sobreposição em páginas com ações no topo. */
body.condomit-no-topbar .resident-overview,
body.condomit-no-topbar .notifications-page,
body.condomit-no-topbar .marketplace-page,
body.condomit-no-topbar .lost-found-page {
  padding-top: 72px !important;
}
body.condomit-no-topbar .chat-page {
  padding-top: 76px !important;
  height: calc(100svh - 156px) !important;
}
body.condomit-no-topbar .marketplace-head,
body.condomit-no-topbar .lost-found-page-header,
body.condomit-no-topbar .page-head,
body.condomit-no-topbar .chat-header {
  padding-right: 72px;
}
body.condomit-no-topbar .lost-found-page-actions,
body.condomit-no-topbar .page-head .page-actions {
  flex-shrink: 0;
}
.condomit-floating-bell {
  top: 18px; right: 18px; width: 48px; height: 48px; border-radius: 16px;
}
.sidebar .nav-item.active {
  background: rgba(14,165,164,.18) !important;
  border: 1px solid rgba(94,234,212,.24);
  color: #ffffff !important;
}
.sidebar .nav-item:hover {
  background: rgba(255,255,255,.12);
}
@media(max-width:900px) {
  body.condomit-no-topbar .resident-overview,
  body.condomit-no-topbar .notifications-page,
  body.condomit-no-topbar .marketplace-page,
  body.condomit-no-topbar .lost-found-page,
  body.condomit-no-topbar .chat-page {
    padding-top: 58px !important;
  }
  body.condomit-no-topbar .marketplace-head,
  body.condomit-no-topbar .lost-found-page-header,
  body.condomit-no-topbar .page-head,
  body.condomit-no-topbar .chat-header { padding-right: 56px; }
}
"""
if '056 - reserva espaço para o sino' not in css:
    css += add
write('styles/sidebar-account-navigation.css', css)

# 9) chat css polish for search input and header spacing
css = read('styles/chat.css')
add = """

/* 0726 - ajustes do campo de busca e espaço do sino na página de chat. */
.chat-header { padding-right: 76px; }
.chat-contact-search { position: relative; }
.chat-contact-search i { left: 16px !important; z-index: 2; }
.chat-contact-search input {
    width: 100% !important;
    min-height: 48px;
    padding: 0 16px 0 44px !important;
    border: 1px solid #dbe4ef !important;
    border-radius: 14px !important;
    background: #fff;
    color: #334155;
    box-sizing: border-box;
}
.chat-contact-search input:focus {
    outline: none;
    border-color: #294FD8 !important;
    box-shadow: 0 0 0 3px rgba(41,79,216,.08);
}
"""
if '0726 - ajustes do campo de busca' not in css:
    css += add
write('styles/chat.css', css)
# bump chat css ref and script version across chat page only
html = read('pages/chat.html')
html = html.replace('../styles/chat.css?v=0725', '../styles/chat.css?v=0726')
write('pages/chat.html', html)

# 10) marketplace css redesign
css = read('styles/marketplace.css')
# Replace root top padding and add major redesign overrides
add = """

/* 056 - marketplace redesenhado com busca limpa e sem bordas duplas. */
.marketplace-page { padding: 0 32px 32px; }
.marketplace-head { margin-bottom: 18px; align-items: flex-end; }
.marketplace-head h2 { font-size: clamp(1.65rem, 2vw, 2rem); color: #0f172a; }
.marketplace-head p { max-width: 620px; }
.marketplace-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
}
.search-box {
    position: relative;
    border: none;
    padding: 0;
    background: transparent;
    box-shadow: none;
}
.search-box i {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #64748b;
    z-index: 2;
}
.search-box input {
    width: 100%;
    min-height: 52px;
    padding: 0 18px 0 46px !important;
    border: 1px solid #dbe2f0 !important;
    border-radius: 16px !important;
    background: #fff !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
}
.search-box input:focus {
    outline: none;
    border-color: #294FD8 !important;
    box-shadow: 0 0 0 4px rgba(41,79,216,.08);
}
.toolbar-actions { flex-wrap: wrap; justify-content: flex-end; }
.toolbar-actions select {
    min-height: 52px;
    min-width: 185px;
    padding: 0 16px;
    border-radius: 16px !important;
    appearance: none;
    background: linear-gradient(180deg,#fff,#f8fbff) !important;
    box-shadow: 0 1px 2px rgba(15,23,42,.03);
}
.toolbar-actions .ghost-btn,
.marketplace-head .primary-action,
.marketplace-modal-actions .ghost-btn,
.marketplace-modal-actions .primary-action {
    min-height: 52px;
    border-radius: 16px;
}
.category-shortcuts { margin: 4px 0 20px; }
.category-chip { min-height: 44px; border-radius: 999px; }
.marketplace-layout {
    grid-template-columns: minmax(0,1.55fr) minmax(280px,.9fr);
    align-items: start;
}
.products-grid { grid-template-columns: repeat(auto-fill, minmax(230px,1fr)); }
.product-card {
    border-radius: 18px;
    background: linear-gradient(180deg,#fff,#fbfdff);
}
.product-card .card-body { padding: 18px 16px 12px; }
.product-card .card-footer { padding: 0 16px 16px; }
.marketplace-detail { position: sticky; top: 96px; }
@media (max-width: 980px) {
    .marketplace-page { padding: 0 18px 22px; }
    .marketplace-toolbar, .marketplace-layout { grid-template-columns: 1fr; }
    .toolbar-actions { justify-content: stretch; }
    .toolbar-actions > * { width: 100%; }
    .marketplace-detail { position: static; top: auto; }
}
"""
if '056 - marketplace redesenhado' not in css:
    css += add
write('styles/marketplace.css', css)

# 11) lost-found css redesign
css = read('styles/achados-perdidos.css')
add = """

/* 056 - achados e perdidos redesenhado com filtros e busca limpos. */
.lost-found-page { padding: 0 32px 32px; }
.lost-found-page-header {
    display:flex;
    align-items:flex-end;
    justify-content:space-between;
    gap:16px;
    margin-bottom:18px;
    flex-wrap:wrap;
}
.lost-found-page-header h2 { font-size: clamp(1.65rem,2vw,2rem); color:#0f172a; margin-bottom:6px; }
.lost-found-page-header p { color:#64748b; max-width:640px; }
.lost-found-page-actions { display:flex; gap:12px; }
.toolbar { align-items: center; }
.search-box {
    position: relative;
    border: none !important;
    padding: 0 !important;
    background: transparent !important;
}
.search-box i {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #64748b;
    z-index: 2;
}
.search-box input {
    min-height: 52px;
    padding: 0 18px 0 46px !important;
    border: 1px solid #dbe2f0 !important;
    border-radius: 16px !important;
    background: #fff !important;
    box-sizing: border-box;
}
.search-box input:focus { outline:none; border-color:#294FD8 !important; box-shadow:0 0 0 4px rgba(41,79,216,.08); }
.status-filter-group {
    padding: 4px;
    border: 1px solid #dbe2f0;
    border-radius: 16px;
    background: #fff;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.7);
}
.sort-filter-wrap {
    min-height: 52px;
    padding: 0 14px;
    border: 1px solid #dbe2f0;
    border-radius: 16px;
    background: #fff;
}
.sort-filter-wrap select {
    min-height: 50px;
    padding: 0 6px !important;
}
.lost-found-layout { align-items:start; }
.items-grid { grid-template-columns: repeat(auto-fill,minmax(220px,1fr)); }
.res-item-card { border-radius: 18px; }
.lost-found-sidebar .card-shell { position: sticky; top: 96px; }
.primary-action, .ghost-btn { min-height: 52px; border-radius: 16px; }
@media (max-width: 980px) {
    .lost-found-page { padding: 0 18px 24px; }
    .lost-found-layout { grid-template-columns: 1fr; }
    .lost-found-sidebar .card-shell { position: static; top: auto; }
}
"""
if '056 - achados e perdidos redesenhado' not in css:
    css += add
write('styles/achados-perdidos.css', css)

# 12) tipo-usuario css polish
css = read('styles/tipo-usuario.css')
add = """

/* 056 - refinamento visual e responsividade da escolha de perfil. */
body { min-height: 100vh; overflow-x: hidden; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
.top-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.cards { align-items: stretch; }
.profile { height: 100%; }
.choose, .continue { white-space: nowrap; }
@media (max-width: 760px) {
  .topbar, .top-actions { justify-content:center; }
  .bottom { gap: 14px; flex-wrap: wrap; }
}
"""
if '056 - refinamento visual' not in css:
    css += add
write('styles/tipo-usuario.css', css)

# 13) index-morador css slight spacing
css = read('styles/index-morador.css')
add = """

/* 055 - painel do morador mais limpo sem o nome do condomínio no topo. */
.resident-welcome { align-items: flex-start; }
.resident-welcome > div { max-width: 760px; }
"""
if '055 - painel do morador mais limpo' not in css:
    css += add
write('styles/index-morador.css', css)

# 14) marketplace and achados script version bumps not file changes needed but references done. Also chat page uses sidebar css v056.
for page in ['pages/marketplace.html', 'pages/achados-perdidos.html', 'pages/chat.html', 'pages/tipo-usuario.html', 'pages/index-morador.html', 'pages/mural-avisos.html']:
    p = root/page
    if not p.exists():
        continue
    txt = p.read_text(encoding='utf-8')
    txt = txt.replace('../styles/sidebar-account-navigation.css?v=054', '../styles/sidebar-account-navigation.css?v=056')
    txt = txt.replace('../scripts/sidebar-links.js?v=054', '../scripts/sidebar-links.js?v=056')
    p.write_text(txt, encoding='utf-8')

# 15) update chat/page links maybe topbar_actions versions not necessary.

# 16) if marketplace/achados scripts refs not changed elsewhere, done.

print('patch complete')
