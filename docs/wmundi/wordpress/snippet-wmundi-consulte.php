/**
 * WMundi: mostra "Consulte" no lugar do preço nos produtos da loja que não têm valor definido.
 * Não altera produtos com preço, o carrinho nem o pagamento (Stripe).
 */
add_filter( 'woocommerce_get_price_html', function ( $preco, $produto ) {
	if ( '' === (string) $produto->get_price() ) {
		return '<span class="wmundi-consulte">Consulte</span>';
	}
	return $preco;
}, 10, 2 );
