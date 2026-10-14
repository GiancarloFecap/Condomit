from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path('/mnt/data/condomit_v068_work')
with sync_playwright() as p:
  br=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
  for page_name in ['tipo-usuario','entrar','cadastro-sindico']:
    page=br.new_page(viewport={'width':1280,'height':720})
    page.on('pageerror',lambda e:print('PAGE ERROR',str(e)))
    url=(root/'pages'/f'{page_name}.html').as_uri()
    try:
      page.goto(url,wait_until='domcontentloaded',timeout=15000)
      page.wait_for_timeout(1000)
      print('\n',page_name,'before',page.locator('h1').first.inner_text(), 'select',page.locator('#landing-language-select').input_value())
      page.locator('#landing-language-select').select_option('en')
      page.wait_for_timeout(250)
      print(page_name, 'after', page.locator('h1').first.inner_text(), 'select',page.locator('#landing-language-select').input_value(),'lang',page.locator('html').get_attribute('lang'))
      if page_name=='tipo-usuario':
        print('heading2',page.locator('#tipoSubtitle').inner_text())
      print('document height',page.evaluate('document.documentElement.scrollHeight'),'viewport',page.evaluate('window.innerHeight'))
    except Exception as exc:
      print('ERROR',str(exc)[:300])
    page.close()
  br.close()
