@echo off
REM cline-project.cmd - turn a folder into a harness project. (C194)
REM
REM Normal use: copy this file into your project folder and run it there once (double-click).
REM It registers that folder; after that the proxy applies the harness whenever Cline works in
REM that folder, whatever model is selected. Nothing in Cline's settings is changed.
REM
REM   cline-project.cmd                                   (inside a project folder) register this folder
REM   cline-project.cmd off                               (inside a project folder) unregister this folder
REM   cline-project.cmd <project folder> ["test command"] register another folder
REM   cline-project.cmd status                            list registered projects, check Cline's settings
REM
REM The work is done by cline-proxy\cline-project.js in the harness repo. When this file is not in the
REM repo itself, the repo is taken from HARNESS_REPO (default C:\project_01).
REM CLINE_PROJECT_NOPAUSE=1 skips the final pause (pause reads the console, so a redirected run would hang).
setlocal
set "CLINE_PROJECT_HERE="
set "JS=%~dp0cline-proxy\cline-project.js"
if exist "%JS%" goto run
if not defined HARNESS_REPO set "HARNESS_REPO=C:\project_01"
set "JS=%HARNESS_REPO%\cline-proxy\cline-project.js"
set "CLINE_PROJECT_HERE=%~dp0"
if exist "%JS%" goto run
echo Cannot find %JS%
echo Set HARNESS_REPO to the folder that contains cline-proxy, then run this again.
set RC=1
goto done
:run
node "%JS%" %*
set RC=%ERRORLEVEL%
:done
if not defined CLINE_PROJECT_NOPAUSE pause
exit /b %RC%
