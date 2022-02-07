precision highp float;
varying vec2 Uv;
uniform sampler2D OldPositionsTexture;

void main()
{
	vec4 Sample = texture2D( OldPositionsTexture, Uv );
	
	Sample.y += 0.001;
	
	gl_FragColor = Sample;
}

