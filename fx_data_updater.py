import yfinance as yf
import json
import time
import os
import pandas as pd
from datetime import datetime

script_dir = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(script_dir, "fx_chart_data.js")

TICKERS = ['THB=X', 'HKD=X', 'CNY=X', 'JPY=X', 'SGD=X', 'EUR=X']
CURRENCIES = ['USD', 'HKD', 'CNY', 'JPY', 'SGD', 'EUR']

def fetch_fx_data():
    print(f"[{datetime.now().isoformat()}] Fetching 3-year historical FX data...")
    try:
        data = yf.download(TICKERS, period="3y", progress=False)
        
        # yfinance might return MultiIndex if multiple tickers
        if isinstance(data.columns, pd.MultiIndex):
            close_data = data['Close']
        else:
            close_data = data
            
        # Drop rows where THB is NaN
        close_data = close_data.dropna(subset=['THB=X'])
        
        fx_dict = {}
        for ccy in CURRENCIES:
            fx_dict[ccy] = {}
        
        for date, row in close_data.iterrows():
            date_str = date.strftime('%Y-%m-%d')
            thb_rate = row['THB=X']
            
            if pd.isna(thb_rate):
                continue
                
            fx_dict['USD'][date_str] = round(float(thb_rate), 4)
            
            # For others, calculate cross rate
            for ccy, ticker in zip(['HKD', 'CNY', 'JPY', 'SGD', 'EUR'], 
                                 ['HKD=X', 'CNY=X', 'JPY=X', 'SGD=X', 'EUR=X']):
                f_rate = row[ticker]
                if not pd.isna(f_rate) and f_rate > 0:
                    cross_rate = thb_rate / f_rate
                    fx_dict[ccy][date_str] = round(float(cross_rate), 4)
        
        js_content = f"window.FX_CHART_DATA = {json.dumps(fx_dict)};"
        
        with open(OUTPUT_FILE, "w", encoding='utf-8') as f:
            f.write(js_content)
            
        print(f"Successfully saved FX historical data to {OUTPUT_FILE}.")
        
    except Exception as e:
        print(f"Error fetching FX data: {e}")

if __name__ == "__main__":
    fetch_fx_data()
