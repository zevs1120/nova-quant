import qlib
from qlib.data import D
from pathlib import Path

# Init qlib
provider_uri = str(Path.home() / ".qlib" / "qlib_data" / "us_data")
print(f"Initializing Qlib with provider_uri: {provider_uri}")
qlib.init(provider_uri=provider_uri, region=qlib.config.REG_US)

instruments = D.instruments(filter_pipe=[])
instruments_list = D.list_instruments(instruments=instruments, as_list=True)
print(f"Total instruments loaded: {len(instruments_list)}")
symbols = instruments_list[:5]
print(f"Sample symbols: {symbols}")

test_symbol = "AAPL" if "AAPL" in instruments_list else symbols[0]

fields = ["$close", "Ref($close, 1)", "Mean($close, 5)", "$close / Ref($close, 1) - 1"]
names = ["Close", "Close_1", "MA_5", "Return"]

print(f"\nLoading basic features for {test_symbol}...")
df = D.features([test_symbol], fields, start_time="2024-01-01", end_time="2026-03-31")
df.columns = names
print(df.tail(10))

print("\nTesting Alpha158 base components...")
fields_alpha = [
    "($close-$open)/$open",
    "($high-$low)/$open",
    "($close-$low)/($high-$low+1e-12)",
]
names_alpha = ["KMID", "KBOX", "KPL"]
df_alpha = D.features(
    [test_symbol], fields_alpha, start_time="2024-01-01", end_time="2026-03-31"
)
df_alpha.columns = names_alpha
print(df_alpha.tail(10))
