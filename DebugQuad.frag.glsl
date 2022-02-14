precision highp float;

uniform sampler2D Texture;
varying vec2 Uv;


void main()
{
	gl_FragColor = texture2D( Texture, Uv );
	//gl_FragColor.xy = Uv;
	//gl_FragColor.w = 1.0;
}


