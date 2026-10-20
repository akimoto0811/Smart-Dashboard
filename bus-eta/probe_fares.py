import urllib.request
for name in ['FARE_BUS.xml','RSTOP_BUS.xml']:
 url='https://static.data.gov.hk/td/routes-fares-xml/'+name
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HKBusETA-Dashboard/1.0'}),timeout=120) as r:raw=r.read()
  t=raw.decode('utf-8-sig','replace');print(name,len(raw),'bytes');print(t[:1500]);i=t.find('<ROUTE_ID>1773<');print('680 sample:',t[max(0,i-200):i+1200])
 except Exception as e:print(name,'error',e)
