precision highp float;
attribute vec2 TexCoord;
varying vec2 Uv;

void main()
{
	gl_Position.xy = mix( vec2(-1,-1), vec2(1,1), TexCoord );
	gl_Position.z = 1.0;
	gl_Position.w = 1.0;
	
	Uv = TexCoord;
}

