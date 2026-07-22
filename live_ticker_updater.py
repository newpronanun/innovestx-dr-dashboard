import yfinance as yf
import json
import time
import os
import re

script_dir = os.path.dirname(os.path.abspath(__file__))
data_js_path = os.path.join(script_dir, "data.js")
OUTPUT_FILE = os.path.join(script_dir, "live_ticker_data.js")

def get_tickers():
    if not os.path.exists(data_js_path):
        return []
    with open(data_js_path, "r", encoding="utf-8") as f:
        content = f.read()
    tickers = list(set(re.findall(r'"Underlying_Ticker":\s*"([^"]+)"', content)))
    return [t for t in tickers if t != "N/A"]

def fetch_data():
    tickers = get_tickers()
    if not tickers:
        print("No tickers found")
        return
        
    print(f"Fetching live data from Yahoo Finance for {len(tickers)} tickers...")
    try:
        tickers_str = " ".join(tickers)
        data = yf.Tickers(tickers_str)
        
        results = []
        for symbol in tickers:
            try:
                # fast_info is often more reliable and faster for current price
                ticker = data.tickers[symbol]
                current_price = ticker.fast_info.get("lastPrice")
                prev_close = ticker.fast_info.get("previousClose")
                
                if current_price and prev_close:
                    change_pct = ((current_price - prev_close) / prev_close) * 100
                    results.append({
                        "symbol": symbol,
                        "price": round(current_price, 2),
                        "changePct": round(change_pct, 2)
                    })
            except Exception as e:
                pass # Silent fail for individual tickers to not clutter logs
                
        if results:
            js_content = f"window.LIVE_TICKER_DATA = {json.dumps(results)};"
            with open(OUTPUT_FILE, "w") as f:
                f.write(js_content)
            print(f"Successfully updated {OUTPUT_FILE} with {len(results)} tickers.")
    except Exception as e:
        print(f"Global error fetching data: {e}")

if __name__ == "__main__":
    fetch_data()
