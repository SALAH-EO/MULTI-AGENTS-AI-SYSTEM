FROM n8nio/n8n:latest

USER root
RUN apk add --update --no-cache \
    python3 \
    py3-pip \
    chromium \
    chromium-chromedriver \
    libstdc++ \
    ttf-freefont \
    fontconfig \
    build-base \
    g++ \
    make \
    python3-dev \
    gfortran \
    openblas-dev \
    lapack-dev && \
    rm -rf /var/cache/apk/*
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_BIN=/usr/bin/chromium-browser

USER node
RUN python3 -m pip install --user --break-system-packages \
    pipx \
    selenium \
    webdriver-manager \
    oauth2client \
    gspread \
    google-auth \
    requests \
    beautifulsoup4 \
    feedparser \
    pandas \
    anthropic \
    google-api-python-client \
    scikit-learn --find-links https://download.pytorch.org/whl/cpu/torch_stable.html

ENV PATH="/home/node/.local/bin:$PATH"