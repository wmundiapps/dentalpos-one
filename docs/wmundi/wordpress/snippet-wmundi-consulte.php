/**
 * WMundi: mostra "Consulte" no lugar do preço nos produtos da loja que não têm valor definido.
 * Alguns produtos têm um texto próprio (por SKU). Não altera produtos com preço, o carrinho nem o pagamento (Stripe).
 */
add_filter( 'woocommerce_get_price_html', function ( $preco, $produto ) {
	$rotulos = array(
		'WM-WHATSPEAK' => 'Premium: US$ 10 / mês',
		'WM-SPACEHOUR' => 'Sem mensalidade: 5% por reserva',
	);
	$sku = (string) $produto->get_sku();
	if ( isset( $rotulos[ $sku ] ) && '' === (string) $produto->get_price() ) {
		return '<span class="wmundi-consulte">' . esc_html( $rotulos[ $sku ] ) . '</span>';
	}
	if ( '' === (string) $produto->get_price() ) {
		return '<span class="wmundi-consulte">Consulte</span>';
	}
	return $preco;
}, 10, 2 );
