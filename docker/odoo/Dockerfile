# Imagen de Camino: Odoo Community + addons camino_*.
# La misma imagen se usa en local y en cualquier VPS; solo cambian las variables de entorno.
FROM odoo:20.0

USER root

# uv instala las dependencias Python extra que necesiten los addons.
COPY --from=ghcr.io/astral-sh/uv:0.12.9 /uv /usr/local/bin/uv

COPY docker/odoo/requirements.txt /tmp/requirements.txt
RUN if grep -qvE '^\s*(#|$)' /tmp/requirements.txt; then \
        uv pip install --system --break-system-packages --no-cache -r /tmp/requirements.txt; \
    fi

COPY --chown=odoo:odoo src/addons /mnt/extra-addons
COPY --chown=odoo:odoo src/config/odoo.conf /etc/odoo/odoo.conf

USER odoo
