import os
import re
import yfinance as yf
import json
import time
import pandas as pd

script_dir = os.path.dirname(os.path.abspath(__file__))
data_js_path = os.path.join(script_dir, "data.js")
output_file = os.path.join(script_dir, "historical_chart_data.js")

def update_historical_data():
    print("Starting historical data update...")
    if not os.path.exists(data_js_path):
        print(f"Error: {data_js_path} not found.")
        return

    with open(data_js_path, "r", encoding="utf-8") as f:
        content = f.read()

    tickers = list(set(re.findall(r'"Underlying_Ticker":\s*"([^"]+)"', content)))
    print(f"Found {len(tickers)} unique tickers. Fetching 3 years of daily data...")

    data_dict = {}

    for ticker in tickers:
        try:
            # For yf.download to be silent
            df = yf.download(ticker, period="3y", interval="1d", progress=False)
            if df.empty:
                print(f"No data for {ticker}")
                continue
            
            df = df.reset_index()
            
            # yfinance recent versions return MultiIndex columns when downloading a single ticker sometimes,
            # or when you use certain kwargs. Let's ensure columns are flat.
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [c[0] for c in df.columns]

            chart_data = []
            for index, row in df.iterrows():
                # Some index might be named differently depending on yfinance version
                date_col = 'Date' if 'Date' in df.columns else 'Datetime'
                if date_col not in df.columns:
                    date_col = df.columns[0] # Usually the first is the date/time
                
                # Check for NaN
                if pd.isna(row['Open']) or pd.isna(row['High']) or pd.isna(row['Low']) or pd.isna(row['Close']):
                    continue
                    
                date_val = row[date_col].strftime('%Y-%m-%d')
                
                chart_data.append({
                    'time': date_val,
                    'open': float(row['Open']),
                    'high': float(row['High']),
                    'low': float(row['Low']),
                    'close': float(row['Close'])
                })
            
            data_dict[ticker] = chart_data
            print(f"Fetched {len(chart_data)} days of data for {ticker}")
            
        except Exception as e:
            print(f"Failed for {ticker}: {e}")
            
    js_content = f"window.HISTORICAL_CHART_DATA = {json.dumps(data_dict)};"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Done saving historical data to {output_file}.")

if __name__ == "__main__":
    update_historical_data()
