import sys
import os
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException
import csv
import time
import pickle
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import parameters
import json

# Configuration
DELAY_BETWEEN_ACTIONS = getattr(parameters, 'delay_between_requests', 5)
BROWSER_DATA_DIR = os.path.abspath("/data/shared/linkedin_browser_data")
COOKIES_FILE = os.path.abspath("/data/shared/linkedin_cookies.pkl")
CSV_FILE = getattr(parameters, 'file_name', '/data/shared/linkedin_contacts.csv')
GOOGLE_SHEET_NAME = getattr(parameters, 'google_sheet_name', 'LinkedIn Contacts')
GOOGLE_SHEET_TAB = getattr(parameters, 'google_sheet_tab', 'Sheet1')
GOOGLE_SHEET_CREDENTIALS = getattr(parameters, 'google_sheet_credentials', '/data/shared/credentials.json')
CHROME_VERSION = "136.0.7103"

def setup_persistent_browser():
    """Setup Chrome browser with persistent data for headless operation"""
    try:
        if not os.path.exists(BROWSER_DATA_DIR):
            os.makedirs(BROWSER_DATA_DIR)
        
        options = webdriver.ChromeOptions()
        options.add_argument(f"--user-data-dir={BROWSER_DATA_DIR}")
        options.add_argument("--profile-directory=LinkedInProfile")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--headless=new")
        options.binary_location = "/usr/bin/chromium-browser"
        
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager(driver_version=CHROME_VERSION).install()),
            options=options
        )
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        return driver
    except Exception as e:
        with open('/data/shared/setup_error.html', 'w') as f:
            f.write(f"Browser setup failed: {str(e)}")
        raise

def close_messaging_bar_after_load(driver):
    """Close the messaging bar after page load using a reliable selector"""
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 
                "div[id*='msg-overlay'] button.msg-overlay-bubble-header__control.artdeco-button--circle[aria-label*='Close your conversation']"))
        )
        close_buttons = driver.find_elements(By.CSS_SELECTOR, 
            "div[id*='msg-overlay'] button.msg-overlay-bubble-header__control.artdeco-button--circle[aria-label*='Close your conversation']")
        if close_buttons:
            for button in close_buttons:
                if button.is_displayed() and button.is_enabled():
                    time.sleep(DELAY_BETWEEN_ACTIONS / 2)
                    safe_click(driver, button, use_js=True)
                    time.sleep(DELAY_BETWEEN_ACTIONS / 2)
    except TimeoutException:
        pass
    except Exception:
        pass

def close_chat_overlays(driver):
    """Attempt to close any chat overlays that might interfere with clicking buttons"""
    try:
        chat_windows = driver.find_elements(By.XPATH, 
            "//button[contains(@class, 'msg-overlay-bubble-header__control') and not(contains(@class, 'msg-overlay-bubble-header__control--new-convo-btn'))]")
        for chat in chat_windows:
            try:
                chat.click()
                time.sleep(1)
            except Exception:
                pass
        minimizers = driver.find_elements(By.XPATH, 
            "//button[contains(@class, 'msg-overlay-bubble-header__button') and contains(@data-control-name, 'minimize')]")
        for minimizer in minimizers:
            try:
                minimizer.click()
                time.sleep(1)
            except Exception:
                pass
    except Exception:
        pass

def is_logged_in(driver):
    """Check if user is already logged in to LinkedIn"""
    try:
        driver.get('https://www.linkedin.com/feed/')
        time.sleep(DELAY_BETWEEN_ACTIONS)
        logged_in_indicators = [
            "//div[contains(@class, 'feed-identity-module')]",
            "//button[contains(@class, 'global-nav__primary-link') and contains(@aria-label, 'Start a post')]",
            "//div[contains(@class, 'application-outlet')]"
        ]
        for indicator in logged_in_indicators:
            if driver.find_elements(By.XPATH, indicator):
                close_messaging_bar_after_load(driver)
                close_chat_overlays(driver)
                return True
        return False
    except Exception:
        return False

def login_to_linkedin(driver):
    """Login to LinkedIn if not already logged in"""
    if is_logged_in(driver):
        return True
    
    try:
        driver.get('https://www.linkedin.com/login')
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.ID, "username"))
        )
        driver.find_element(By.ID, 'username').send_keys(parameters.linkedin_username)
        time.sleep(DELAY_BETWEEN_ACTIONS / 2)
        driver.find_element(By.ID, 'password').send_keys(parameters.linkedin_password)
        time.sleep(DELAY_BETWEEN_ACTIONS / 2)
        submit_button = driver.find_element(By.XPATH, '//*[@type="submit"]')
        safe_click(driver, submit_button)
        time.sleep(DELAY_BETWEEN_ACTIONS)
        
        # Check for captcha or verification
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
        
        verification = driver.find_elements(By.ID, 'input__email_verification_pin') or \
                      driver.find_elements(By.ID, 'input__phone_verification_pin')
        if verification:
            with open('/data/shared/verification_page.html', 'w') as f:
                f.write(driver.page_source)
            return False
        
        try:
            WebDriverWait(driver, 60).until(
                EC.any_of(
                    EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'feed-identity-module')]")),
                    EC.presence_of_element_located((By.XPATH, "//button[contains(@class, 'global-nav__primary-link')]"))
                )
            )
            close_messaging_bar_after_load(driver)
            close_chat_overlays(driver)
            with open(COOKIES_FILE, 'wb') as f:
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
    """Close the messaging bar during profile processing"""
    try:
        messaging_bar = driver.find_elements(By.CSS_SELECTOR, 
            "#msg-overlay > div.msg-overlay-list-bubble.ml4.msg-overlay-list-bubble__tablet-height > header > div.msg-overlay-bubble-header__badge-container")
        if messaging_bar:
            header = messaging_bar[0].find_element(By.XPATH, "./ancestor::header")
            close_button = header.find_elements(By.XPATH, 
                ".//button[contains(@class, 'msg-overlay-bubble-header__control') and not(contains(@class, 'msg-overlay-bubble-header__control--new-convo-btn'))]")
            if close_button:
                time.sleep(DELAY_BETWEEN_ACTIONS / 2)
                safe_click(driver, close_button[0], use_js=True)
                time.sleep(DELAY_BETWEEN_ACTIONS / 2)
    except Exception:
        pass

def safe_click(driver, element, use_js=False):
    """Safely click an element with fallback to JavaScript click"""
    try:
        if use_js:
            driver.execute_script("arguments[0].click();", element)
        else:
            try:
                element.click()
            except ElementClickInterceptedException:
                driver.execute_script("arguments[0].click();", element)
        time.sleep(DELAY_BETWEEN_ACTIONS / 2)
        return True
    except Exception:
        return False

def get_data_from_sheets():
    """Connect to Google Sheets and get URLs and messages"""
    try:
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds = ServiceAccountCredentials.from_json_keyfile_name(GOOGLE_SHEET_CREDENTIALS, scope)
        client = gspread.authorize(creds)
        sheet = client.open(GOOGLE_SHEET_NAME).worksheet(GOOGLE_SHEET_TAB)
        data = sheet.get_all_records()
        url_message_pairs = [(row['link'], row.get('message', '')) for row in data if 'link' in row and row['link']]
        return url_message_pairs
    except Exception as e:
        with open('/data/shared/sheet_error.html', 'w') as f:
            f.write(f"Google Sheets error: {str(e)}")
        raise

def load_processed_urls(file_name):
    """Load URLs that have been processed from the CSV file"""
    try:
        processed_urls = set()
        if os.path.isfile(file_name):
            with open(file_name, 'r', encoding='utf-8') as csvfile:
                reader = csv.reader(csvfile)
                next(reader, None)
                for row in reader:
                    if len(row) >= 3 and row[2] == "MESSAGED":
                        processed_urls.add(row[1])
        return processed_urls
    except Exception as e:
        with open('/data/shared/csv_error.html', 'w') as f:
            f.write(f"CSV read error: {str(e)}")
        raise

def send_messages(driver, url_message_pairs, writer, processed_urls):
    """Check for message button and send messages"""
    results = []
    for index, (url, message) in enumerate(url_message_pairs, start=1):
        result = {"url": url, "status": "", "profile_name": "", "error": ""}
        if not message:
            result["status"] = "SKIPPED"
            result["error"] = "No message provided"
            results.append(result)
            continue
        if url in processed_urls:
            result["status"] = "SKIPPED"
            result["error"] = "Already MESSAGED"
            results.append(result)
            continue

        try:
            driver.get(url)
            time.sleep(DELAY_BETWEEN_ACTIONS)
            close_messaging_bar(driver)
            close_chat_overlays(driver)
            
            message_buttons = driver.find_elements(By.CSS_SELECTOR, 
                "button.artdeco-button--primary > span.artdeco-button__text")
            message_button = None
            for btn in message_buttons:
                if btn.text.strip().lower() == "message":
                    parent_button = btn.find_element(By.XPATH, "./ancestor::button")
                    if parent_button.is_displayed() and parent_button.is_enabled():
                        message_button = parent_button
                        break
            
            if message_button:
                driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'});", message_button)
                time.sleep(DELAY_BETWEEN_ACTIONS / 2)
                if safe_click(driver, message_button, use_js=True):
                    time.sleep(DELAY_BETWEEN_ACTIONS)
                    textarea = driver.find_elements(By.CSS_SELECTOR, 
                        "div.msg-form__contenteditable[contenteditable='true'][role='textbox']")
                    if textarea:
                        driver.execute_script("arguments[0].innerHTML = '';", textarea[0])
                        textarea[0].send_keys(message)
                        time.sleep(DELAY_BETWEEN_ACTIONS / 2)
                        send_buttons = driver.find_elements(By.CSS_SELECTOR, 
                            "button.msg-form__send-button.artdeco-button--1[type='submit']")
                        if send_buttons and send_buttons[0].is_enabled():
                            time.sleep(DELAY_BETWEEN_ACTIONS / 2)
                            if safe_click(driver, send_buttons[0]):
                                profile_name_element = driver.find_elements(By.CLASS_NAME, 'text-heading-xlarge')
                                profile_name = profile_name_element[0].text if profile_name_element else f"Profile at {url}"
                                writer.writerow([profile_name, url, "MESSAGED"])
                                result["status"] = "MESSAGED"
                                result["profile_name"] = profile_name
                                try:
                                    close_button = WebDriverWait(driver, 10).until(
                                        EC.element_to_be_clickable((By.CSS_SELECTOR, 
                                            "div[id*='msg-overlay'] button.msg-overlay-bubble-header__control.artdeco-button--circle[aria-label*='Close your conversation']"))
                                    )
                                    time.sleep(DELAY_BETWEEN_ACTIONS / 2)
                                    safe_click(driver, close_button, use_js=True)
                                    time.sleep(DELAY_BETWEEN_ACTIONS / 2)
                                    close_chat_overlays(driver)
                                except TimeoutException:
                                    result["error"] = "Close button not found"
                                except Exception as e:
                                    result["error"] = f"Error closing message bar: {str(e)}"
                            else:
                                result["status"] = "ERROR"
                                result["error"] = "Failed to click send button"
                        else:
                            result["status"] = "ERROR"
                            result["error"] = "Send button not found or not enabled"
                    else:
                        result["status"] = "ERROR"
                        result["error"] = "Message textarea not found"
                else:
                    result["status"] = "ERROR"
                    result["error"] = "Failed to click message button"
            else:
                result["status"] = "NOT CONNECTED"
                result["error"] = "No message button found"
            
            results.append(result)
            time.sleep(DELAY_BETWEEN_ACTIONS)
        except Exception as e:
            result["status"] = "ERROR"
            result["error"] = str(e)
            results.append(result)
    
    return results

# Main execution
results = []
try:
    driver = setup_persistent_browser()
    if not login_to_linkedin(driver):
        driver.quit()
        sys.exit(1)
    
    file_exists = os.path.isfile(CSV_FILE)
    writer = csv.writer(open(CSV_FILE, 'a', encoding='utf-8', newline=''))
    if not file_exists:
        writer.writerow(['Name', 'LinkedIn URL', 'Status'])
    
    processed_urls = load_processed_urls(CSV_FILE)
    url_message_pairs = get_data_from_sheets()
    
    results = send_messages(driver, url_message_pairs, writer, processed_urls)
    with open('/data/shared/results.json', 'w') as f:
        json.dump(results, f, indent=2)
    sys.exit(0)
except KeyboardInterrupt:
    with open('/data/shared/results.json', 'w') as f:
        json.dump(results, f, indent=2)
    sys.exit(0)
except Exception as e:
    with open('/data/shared/error.html', 'w') as f:
        f.write(f"Script failed: {str(e)}")
    sys.exit(1)
finally:
    try:
        driver.quit()
    except:
        pass