from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install", "camino")
class TestCaminoBaseSmoke(TransactionCase):
    """SPEC-001: el addon base se instala correctamente."""

    def test_modulo_instalado(self):
        modulo = self.env["ir.module.module"].search(
            [("name", "=", "camino_base"), ("state", "=", "installed")]
        )
        self.assertTrue(modulo, "camino_base debe quedar instalado")
