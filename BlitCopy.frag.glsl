precision highp float;
varying vec2 Uv;
uniform sampler2D SourceTexture;

void main()
{
	vec4 Sample = texture2D( SourceTexture, Uv );
	gl_FragColor = Sample;
}

