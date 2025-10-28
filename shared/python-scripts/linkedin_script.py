import sys
import os
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException
import parameters, csv, time, pickle
import gspread
from oauth2client.service_account import ServiceAccountCredentials

DELAY_BETWEEN_REQUESTS = getattr(parameters, 'delay_between_requests', 10)

def setup_persistent_browser():
    try:
        if not os.path.exists(parameters.BROWSER_DATA_DIR):
            os.makedirs(parameters.BROWSER_DATA_DIR)
        options = webdriver.ChromeOptions()
        options.add_argument(f"--user-data-dir={parameters.BROWSER_DATA_DIR}")
        options.add_argument("--profile-directory=LinkedInProfile")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--headless=new")
        options.binary_location = "/usr/bin/chromium-browser"
        chrome_version = "136.0.7103"
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager(driver_version=chrome_version).install()),
            options=options
        )
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        return driver
    except Exception as e:
        raise

def close_messaging_bar_after_load(driver):
    try:
        time.sleep(3)
        close_buttons = driver.find_elements(By.CSS_SELECTOR, "div[id*='msg-overlay'] svg > use")
        if close_buttons:
            safe_click(driver, close_buttons[0], useJs=True)
            time.sleep(1)
    except Exception:
        pass

def is_logged_in(driver):
    try:
        driver.get('https://www.linkedin.com/in')
        close_messaging_bar_after_load(driver)
        logged_in_indicators = [
            "//div[contains(@class, 'feed-identity-module')]",
            "//button[contains(@class, 'global-nav__primary-link') and contains(@aria-label, 'Start a post')]",
            "//div[contains(@class, 'application-outlet')]"
        ]
        for indicator in logged_in_indicators:
            if driver.find_elements(By.XPATH, indicator):
                return True
        return False
    except Exception:
        return False

def login_to_linkedin(driver):
    if is_logged_in(driver):
        return True
    try:
        driver.get('https://www.linkedin.com/login')
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.ID, "username"))
        )
        driver.find_element(By.ID, 'username').send_keys(parameters.linkedin_username)
        driver.find_element(By.ID, 'password').send_keys(parameters.linkedin_password)
        driver.find_element(By.XPATH, '//*[@type="submit"]').click()
        try:
            captcha_indicators = [
                (By.ID, 'captcha-internal'),
                (By.CSS_SELECTOR, 'iframe[src*="recaptcha"]'),
                (By.XPATH, '//div[contains(text(), "Verify you are not a robot")]')
            ]
            for by, value in captcha_indicators:
                if driver.find_elements(by, value):
                    with open('/data/shared/captcha_page.html', 'w') as f:
                        f.write(driver.page_source)
                    driver.quit()
                    sys.exit(0)
        except:
            pass
        try:
            verification = driver.find_elements(By.ID, 'input__email_verification_pin') or \
                          driver.find_elements(By.ID, 'input__phone_verification_pin')
            if verification:
                with open('/data/shared/verification_page.html', 'w') as f:
                    f.write(driver.page_source)
                return False
        except:
            pass
        try:
            WebDriverWait(driver, 60).until(
                EC.any_of(
                    EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'feed-identity-module')]")),
                    EC.presence_of_element_located((By.XPATH, "//button[contains(@class, 'global-nav__primary-link')]"))
                )
            )
            close_messaging_bar_after_load(driver)
            with open(parameters.COOKIES_FILE, 'wb') as f:
                pickle.dump(driver.get_cookies(), f)
            return True
        except TimeoutException:
            with open('/data/shared/login_error.html', 'w') as f:
                f.write(driver.page_source)
            return is_logged_in(driver)
    except Exception:
        with open('/data/shared/login_error.html', 'w') as f:
            f.write(driver.page_source)
        return False

def close_messaging_bar(driver):
    try:
        messaging_bar = driver.find_elements(By.CSS_SELECTOR, 
            "#msg-overlay > div.msg-overlay-list-bubble.ml4 > header > div.msg-overlay-bubble-header__badge-container")
        if messaging_bar:
            header = messaging_bar[0].find_element(By.XPATH, "./ancestor::header")
            close_button = header.find_elements(By.XPATH, 
                ".//button[contains(@class, 'msg-overlay-bubble-header__control') and not(contains(@class, 'msg-overlay-bubble-header__control--new-convo-btn'))]")
            if close_button:
                safe_click(driver, close_button[0], useJs=True)
                time.sleep(1)
    except Exception:
        pass

def close_chat_overlays(driver):
    try:
        chat_windows = driver.find_elements(By.XPATH, 
            "//button[contains(@class, 'msg-overlay-bubble-header__control') and not(contains(@class, 'msg-overlay-bubble-header__control--new-convo-btn'))]")
        for chat in chat_windows:
            chat.click()
            time.sleep(1)
        minimizers = driver.find_elements(By.XPATH, 
            "//button[contains(@class, 'msg-overlay-bubble-header__button') and contains(@data-control-name, 'minimize')]")
        for minimizer in minimizers:
            minimizer.click()
            time.sleep(1)
    except Exception:
        pass

def find_connect_button_by_css(driver):
    try:
        more_buttons = driver.find_elements(By.CSS_SELECTOR, "[id*='profile-overflow-action'] > span")
        if not more_buttons:
            more_buttons = driver.find_elements(By.XPATH, "//button[.//span[text()='More']]")
        if not more_buttons:
            more_buttons = driver.find_elements(By.CSS_SELECTOR, "button[aria-label*='More actions']")
        if not more_buttons:
            more_buttons = driver.find_elements(By.CSS_SELECTOR, "button.artdeco-dropdown__trigger")
        if more_buttons:
            driver.execute_script("arguments[0].scrollIntoView({behavior: 'auto', block: 'center', inline: 'center'});", more_buttons[0])
            safe_click(driver, more_buttons[0])
            time.sleep(3)
            connect_element = None
            connect_elements = driver.find_elements(By.CSS_SELECTOR, 
                "div[role='menuitem'][aria-label*='Connect']:not([aria-label*='suggestion'])")
            if connect_elements:
                connect_element = connect_elements[0]
            if not connect_element:
                dropdown_items = driver.find_elements(By.CSS_SELECTOR, 
                    "div.artdeco-dropdown__item span.artdeco-dropdown__item-text")
                for item in dropdown_items:
                    item_text = item.text.strip().lower()
                    parent = item.find_element(By.XPATH, "..")
                    parent_aria = parent.get_attribute('aria-label') or ''
                    if item_text == 'connect' and 'suggestion' not in parent_aria.lower():
                        connect_element = parent
                        break
            if not connect_element:
                xpath_elements = driver.find_elements(By.XPATH, 
                    "//div[contains(@class, 'artdeco-dropdown__item')]//span[text()='Connect']")
                if xpath_elements:
                    parent = xpath_elements[0].find_element(By.XPATH, "..")
                    parent_aria = parent.get_attribute('aria-label') or ''
                    if 'suggestion' not in parent_aria.lower():
                        connect_element = parent
            if connect_element:
                time.sleep(2)
                return connect_element, True
            else:
                driver.find_element(By.TAG_NAME, "body").click()
                time.sleep(1)
        connect_spans = driver.find_elements(By.CSS_SELECTOR, "span.artdeco-button__text")
        for span in connect_spans:
            if span.text.strip().lower() == "connect":
                parent_button = span.find_element(By.XPATH, "./ancestor::button")
                aria_label = parent_button.get_attribute('aria-label') or ''
                if parent_button.is_displayed() and parent_button.is_enabled() and 'suggestion' not in aria_label.lower():
                    return parent_button, False
        return None, False
    except Exception:
        return None, False

def safe_click(driver, element, useJs=False):
    try:
        if useJs:
            driver.execute_script("arguments[0].click();", element)
        else:
            element.click()
        return True
    except ElementClickInterceptedException:
        driver.execute_script("arguments[0].click();", element)
        return True
    except Exception:
        return False

def get_linkedin_urls_from_sheet():
    try:
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds = ServiceAccountCredentials.from_json_keyfile_name(parameters.google_sheet_credentials, scope)
        client = gspread.authorize(creds)
        sheet = client.open(parameters.google_sheet_name).worksheet(parameters.google_sheet_tab)
        data = sheet.get_all_records()
        linkedin_urls = [row['link'] for row in data if 'link' in row and row['link']]
        return linkedin_urls
    except Exception:
        raise

def load_sent_urls(file_name):
    try:
        sent_urls = set()
        if os.path.isfile(file_name):
            with open(file_name, 'r') as csvfile:
                reader = csv.reader(csvfile)
                next(reader, None)
                for row in reader:
                    if len(row) >= 3 and row[2] == "SENT":
                        sent_urls.add(row[1])
        return sent_urls
    except Exception:
        raise

def send_connection_requests(urls, writer, ignore_list, sent_urls):
    for index, url in enumerate(urls, start=1):
        try:
            if url in sent_urls:
                continue
            driver.get(url)
            time.sleep(5)
            close_chat_overlays(driver)
            close_messaging_bar(driver)
            profile_name_element = driver.find_elements(By.CLASS_NAME, 'text-heading-xlarge')
            profile_name = profile_name_element[0].text if profile_name_element else f"Profile at {url}"
            if profile_name in ignore_list or profile_name.strip() in ignore_list:
                continue
            pending_buttons = driver.find_elements(By.XPATH, "//button[contains(@aria-label, 'Pending') or .//span[text()='Pending']]")
            if pending_buttons:
                continue
            connect_button, from_dropdown = find_connect_button_by_css(driver)
            if connect_button:
                driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'});", connect_button)
                time.sleep(2)
                close_chat_overlays(driver)
                close_messaging_bar(driver)
                if safe_click(driver, connect_button, useJs=from_dropdown):
                    time.sleep(3)
                    send_buttons = driver.find_elements(By.XPATH, 
                        "//button[contains(@aria-label, 'Send without a note') or "
                        "contains(@aria-label, 'Send invitation') or "
                        "(contains(@class, 'artdeco-button--primary') and .//span[text()='Send invitation'])]")
                    if send_buttons and send_buttons[0].is_enabled():
                        if safe_click(driver, send_buttons[0]):
                            writer.writerow([profile_name, url, "SENT"])
                    else:
                        dismiss_buttons = driver.find_elements(By.CLASS_NAME, 'artdeco-modal__dismiss')
                        if dismiss_buttons:
                            safe_click(driver, dismiss_buttons[0])
            time.sleep(DELAY_BETWEEN_REQUESTS)
        except Exception:
            pass

try:
    driver = setup_persistent_browser()
    if not login_to_linkedin(driver):
        driver.quit()
        sys.exit(1)
    file_exists = os.path.isfile(parameters.file_name)
    writer = csv.writer(open(parameters.file_name, 'a', newline=''))
    if not file_exists:
        writer.writerow(['Name', 'LinkedIn URL', 'Status'])
    sent_urls = load_sent_urls(parameters.file_name)
    ignore_list = getattr(parameters, 'ignore_list', '')
    if ignore_list:
        try:
            ignore_list = [i.strip() for i in ignore_list.split(',') if i]
        except AttributeError:
            ignore_list = []
    else:
        ignore_list = []
    urls = get_linkedin_urls_from_sheet()
    send_connection_requests(urls=urls, writer=writer, ignore_list=ignore_list, sent_urls=sent_urls)
except KeyboardInterrupt:
    pass
except Exception:
    pass
finally:
    try:
        driver.quit()
    except:
        pass