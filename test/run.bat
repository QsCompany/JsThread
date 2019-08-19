@echo off
robocopy "../dist/" "./" "jsthread.js" /NFL /NDL /NJH /NJS 
@echo on
http-server -i -g -e -o "/index.html" -c-1