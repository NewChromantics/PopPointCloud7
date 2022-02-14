precision highp float;
attribute vec2 TexCoord;

uniform vec2 OutputTextureSize;

//	instanced
attribute vec2 PixelPosition;
varying vec2 FragPixelPosition;


void main()
{
	//	TexCoord is quad-space
	vec2 TexelSize = vec2(1) / OutputTextureSize;
	
	vec2 Uv = PixelPosition * TexelSize;
	Uv += TexCoord * TexelSize;
	
	gl_Position.xy = mix( vec2(-1,-1), vec2(1,1), Uv );
	gl_Position.z = 0.0;
	gl_Position.w = 1.0;
	
	FragPixelPosition = PixelPosition;
}

