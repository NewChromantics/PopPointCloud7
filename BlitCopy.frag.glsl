precision highp float;
varying vec2 Uv;
uniform sampler2D SourceTexture;

void main()
{
	vec2 Sampleuv = Uv;
	//Sampleuv -= 0.5 / 64.0;//makes no difference
	
	vec4 Sample = texture2D( SourceTexture, Sampleuv );
	gl_FragColor = Sample;
}

