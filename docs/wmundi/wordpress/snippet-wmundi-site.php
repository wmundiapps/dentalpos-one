/**
 * WMundi: mostra o site novo (hospedado no Netlify) no endereço do wmundi.com, sem mexer no resto do WordPress.
 *
 * Como funciona:
 *  - Só assume a página inicial e 3 endereços novos: /portfolio/, /agentes-ia/ e /seja-parceiro/.
 *    Tudo o mais (loja, contato, termos, painel do gestor) continua do WordPress.
 *  - Os endereços novos só entram se o WordPress ainda não tiver uma página ali.
 *  - Se o site novo não responder, o WordPress mostra a página inicial antiga (nada quebra).
 *  - Para ver a página antiga: wmundi.com/?wm=off
 *  - Para recarregar o site novo na hora (administrador logado): wmundi.com/?wm=atualizar
 *  - Os formulários do site novo são repassados ao Netlify (e chegam no info@wmundi.com).
 * Para desligar: desative este snippet.
 */
if ( ! function_exists( 'wmundi_site_config' ) ) {

	function wmundi_site_config() {
		return array(
			'origem'   => 'https://wmundi-novo.netlify.app',
			'caminhos' => array(
				'/'              => '/',
				'/portfolio/'    => '/produtos/',
				'/agentes-ia/'   => '/agentes/',
				'/seja-parceiro/' => '/parceiros/',
			),
			'formularios' => array( 'contato', 'pedido-produto', 'candidatura-parceiro', 'pedido-agente' ),
			'cache'       => 300,
		);
	}

	function wmundi_site_normaliza_caminho( $uri ) {
		$caminho = parse_url( (string) $uri, PHP_URL_PATH );
		$caminho = '/' . trim( (string) $caminho, '/' );
		return '/' === $caminho ? '/' : $caminho . '/';
	}

	/** Troca os endereços do site novo pelos endereços do wmundi.com e libera a indexação. */
	function wmundi_site_reescreve( $html, $origem, $dominio ) {
		$html = str_replace( array( '"/assets/', "'/assets/" ), array( '"' . $origem . '/assets/', "'" . $origem . '/assets/' ), $html );
		$html = str_replace(
			array( 'href="/produtos/', 'href="/agentes/', 'href="/parceiros/' ),
			array( 'href="/portfolio/', 'href="/agentes-ia/', 'href="/seja-parceiro/' ),
			$html
		);
		$html = str_replace( '<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">', $html );
		return $html;
	}

	/**
	 * Devolve array( 'status' => 200, 'html' => '...' ) ou null (null = deixa o WordPress seguir normalmente).
	 */
	function wmundi_site_busca_pagina( $caminho_wp ) {
		$cfg = wmundi_site_config();
		if ( ! isset( $cfg['caminhos'][ $caminho_wp ] ) ) {
			return null;
		}
		$chave = 'wmundi_site_' . md5( $caminho_wp );
		$html  = get_transient( $chave );
		if ( false === $html ) {
			$resp = wp_remote_get( $cfg['origem'] . $cfg['caminhos'][ $caminho_wp ], array( 'timeout' => 8, 'user-agent' => 'WMundiSite/1.0' ) );
			if ( is_wp_error( $resp ) || 200 !== (int) wp_remote_retrieve_response_code( $resp ) ) {
				return null;
			}
			$html = (string) wp_remote_retrieve_body( $resp );
			if ( strlen( $html ) < 5000 || false === stripos( $html, '</html>' ) || false === stripos( $html, '<title>' ) ) {
				return null;
			}
			$html = wmundi_site_reescreve( $html, $cfg['origem'], home_url() );
			set_transient( $chave, $html, (int) $cfg['cache'] );
		}
		return array( 'status' => 200, 'html' => $html );
	}

	/** Repassa um formulário do site novo ao Netlify. Devolve o código HTTP para o navegador. */
	function wmundi_site_repassa_formulario( $post ) {
		$cfg  = wmundi_site_config();
		$nome = isset( $post['form-name'] ) ? (string) $post['form-name'] : '';
		if ( ! in_array( $nome, $cfg['formularios'], true ) ) {
			return null;
		}
		$campos = array();
		foreach ( $post as $k => $v ) {
			if ( is_scalar( $v ) ) {
				$campos[ substr( (string) $k, 0, 60 ) ] = substr( (string) $v, 0, 4000 );
			}
		}
		$resp = wp_remote_post( $cfg['origem'] . '/', array( 'timeout' => 10, 'body' => $campos, 'user-agent' => 'WMundiSite/1.0' ) );
		if ( is_wp_error( $resp ) ) {
			return 502;
		}
		$codigo = (int) wp_remote_retrieve_response_code( $resp );
		return ( $codigo >= 200 && $codigo < 400 ) ? 200 : 502;
	}

	function wmundi_site_executa() {
		if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'DOING_CRON' ) && DOING_CRON ) ) {
			return;
		}
		$metodo  = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( (string) $_SERVER['REQUEST_METHOD'] ) : 'GET';
		$caminho = wmundi_site_normaliza_caminho( isset( $_SERVER['REQUEST_URI'] ) ? $_SERVER['REQUEST_URI'] : '/' );
		$cfg     = wmundi_site_config();

		if ( isset( $_GET['wm'] ) && 'off' === $_GET['wm'] ) {
			return;
		}
		if ( isset( $_GET['wm'] ) && 'atualizar' === $_GET['wm'] && current_user_can( 'manage_options' ) ) {
			foreach ( array_keys( $cfg['caminhos'] ) as $c ) {
				delete_transient( 'wmundi_site_' . md5( $c ) );
			}
		}

		if ( 'POST' === $metodo && '/' === $caminho ) {
			$codigo = wmundi_site_repassa_formulario( $_POST );
			if ( null === $codigo ) {
				return;
			}
			status_header( $codigo );
			header( 'Content-Type: text/plain; charset=UTF-8' );
			echo 200 === $codigo ? 'ok' : 'erro';
			exit;
		}

		if ( 'GET' !== $metodo && 'HEAD' !== $metodo ) {
			return;
		}
		// Endereços novos: só entram se o WordPress não tiver nada ali.
		if ( '/' !== $caminho && ! is_404() ) {
			return;
		}
		$pagina = wmundi_site_busca_pagina( $caminho );
		if ( null === $pagina ) {
			return;
		}
		status_header( 200 );
		header( 'Content-Type: text/html; charset=UTF-8' );
		header( 'X-WMundi-Site: 1' );
		echo $pagina['html']; // phpcs:ignore WordPress.Security.EscapeOutput -- HTML do nosso próprio site, já validado.
		exit;
	}

	add_action( 'template_redirect', 'wmundi_site_executa', 0 );
}
