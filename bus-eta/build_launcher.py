#!/usr/bin/env python3
"""Build native 2-action Mac-signable .shortcut that opens a HTTPS HK Bus dashboard URL."""
import plistlib,sys,uuid,pathlib,urllib.parse
base=pathlib.Path(__file__).resolve().parent
url=(sys.argv[1] if len(sys.argv)>1 else input('Enter the HTTPS URL of your deployed dashboard: ')).strip()
parsed=urllib.parse.urlparse(url)
if parsed.scheme!='https' or not parsed.netloc or parsed.username or parsed.password:
 raise SystemExit('ERROR: Enter a valid HTTPS website URL (e.g. https://USERNAME.github.io/HK-Bus-ETA/)')
def action(name,params):return {'WFWorkflowActionIdentifier':'is.workflow.actions.'+name,'WFWorkflowActionParameters':{'UUID':str(uuid.uuid4()).upper(),**params}}
# The Shortcuts URL action produces input consumed by Open URLs.
u=action('url',{'WFURLActionURL':url})
openAction=action('openurl',{'WFInput':{'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ActionOutput','OutputUUID':u['WFWorkflowActionParameters']['UUID'],'OutputName':'URL'}}})
workflow={'WFWorkflowActions':[u,openAction],'WFWorkflowClientVersion':'2700.0.4','WFWorkflowHasOutputFallback':False,
 'WFWorkflowIcon':{'WFWorkflowIconGlyphNumber':59511,'WFWorkflowIconStartColor':4282601983},
 'WFWorkflowImportQuestions':[],'WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900',
 'WFWorkflowName':'HK Bus Dashboard','WFWorkflowOutputContentItemClasses':[],'WFWorkflowTypes':[],'WFQuickActionSurfaces':[]}
p=base/'HK Bus Dashboard.unsigned.shortcut';p.write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_XML,sort_keys=False))
print('Built:',p)
print('On your Mac, run:')
print('shortcuts sign --mode anyone --input "HK Bus Dashboard.unsigned.shortcut" --output "HK Bus Dashboard.signed.shortcut"')
print('Then open the signed file in Shortcuts.')
